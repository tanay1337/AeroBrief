import type { SQLiteDatabase } from 'expo-sqlite';
import type { MetarObservation, TafForecast, WeatherBundle } from '@/domain/models';
import { DefaultWeatherRepository } from '../weatherRepository';
import { fetchMetars, fetchTafs } from '../noaa';
import { getWeatherCaches, saveWeatherCache } from '../database';

jest.mock('../noaa', () => ({ fetchMetars: jest.fn(), fetchTafs: jest.fn() }));
jest.mock('../database', () => ({ getWeatherCaches: jest.fn(), saveWeatherCache: jest.fn() }));

const mockFetchMetars = jest.mocked(fetchMetars);
const mockFetchTafs = jest.mocked(fetchTafs);
const mockGetCaches = jest.mocked(getWeatherCaches);
const mockSaveCache = jest.mocked(saveWeatherCache);
const db = {} as SQLiteDatabase;

const metar = (icao: string): MetarObservation => ({
  icao, raw: `METAR ${icao}`, observedAt: 1_700_000_000, reportType: 'METAR',
  temperatureC: 20, dewpointC: 10, windDirectionTrue: 270, windSpeedKt: 10,
  windGustKt: null, visibilitySm: 10, visibilityQualifier: null,
  visibilityIsTenKmOrMore: false, cavok: false, pressureHpa: 1013,
  weather: [], clouds: [], verticalVisibilityFt: null, category: 'VFR', trends: []
});

const taf = (icao: string): TafForecast => ({
  icao, raw: `TAF ${icao}`, issuedAt: 1_700_000_000,
  validFrom: 1_700_000_000, validTo: 1_700_086_400, periods: []
});

const cache = (icao: string, fetchedAt: number): WeatherBundle => ({
  icao, metar: metar(icao), taf: taf(icao), fetchedAt, isStale: false
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCaches.mockResolvedValue(new Map());
  mockSaveCache.mockResolvedValue(undefined);
  mockFetchMetars.mockResolvedValue([]);
  mockFetchTafs.mockResolvedValue([]);
});

describe('DefaultWeatherRepository', () => {
  it('batches multiple favorite airports into one request per product', async () => {
    mockFetchMetars.mockResolvedValue([metar('KJFK'), metar('KLAX')]);
    mockFetchTafs.mockResolvedValue([taf('KJFK'), taf('KLAX')]);
    const result = await new DefaultWeatherRepository(db).getWeatherBatch(['kjfk', 'KLAX']);
    expect(mockFetchMetars).toHaveBeenCalledTimes(1);
    expect(mockFetchMetars).toHaveBeenCalledWith(['KJFK', 'KLAX']);
    expect(mockFetchTafs).toHaveBeenCalledWith(['KJFK', 'KLAX']);
    expect(result.KJFK?.metar?.category).toBe('VFR');
    expect(mockSaveCache).toHaveBeenCalledTimes(2);
  });

  it('returns a fresh cache without hitting the network', async () => {
    const current = cache('KJFK', Date.now());
    mockGetCaches.mockResolvedValue(new Map([['KJFK', current]]));
    const result = await new DefaultWeatherRepository(db).getWeather('KJFK');
    expect(result.isStale).toBe(false);
    expect(mockFetchMetars).not.toHaveBeenCalled();
    expect(mockFetchTafs).not.toHaveBeenCalled();
  });

  it('returns stale cached data when both live products fail', async () => {
    const old = cache('KJFK', Date.now() - 600_000);
    mockGetCaches.mockResolvedValue(new Map([['KJFK', old]]));
    mockFetchMetars.mockRejectedValue(new Error('offline'));
    mockFetchTafs.mockRejectedValue(new Error('offline'));
    const result = await new DefaultWeatherRepository(db).getWeather('KJFK');
    expect(result.isStale).toBe(true);
    expect(result.refreshError).toBe('offline');
    expect(mockSaveCache).not.toHaveBeenCalled();
  });
});
