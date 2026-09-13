import type { SQLiteDatabase } from 'expo-sqlite';
import { fetchDwdWarnings } from '../dwd';
import { getAirport, getNearbyAirports } from '../database';
import { attachWeatherBriefing, capturePlannedWeatherBriefing, generateFlightWeatherBriefing, getFlightWeatherBriefing, getPlannedWeatherBriefing, getPlannedBriefingAirportIdents, getValidPlannedWeatherBriefing } from '../flightWeather';
import { getRoutePlan } from '../routePlans';
import { DefaultWeatherRepository } from '../weatherRepository';

jest.mock('../routePlans', () => ({ getRoutePlan: jest.fn() }));
jest.mock('../dwd', () => ({ fetchDwdWarnings: jest.fn() }));
jest.mock('../database', () => ({ getAirport: jest.fn(), getNearbyAirports: jest.fn() }));
jest.mock('../weatherRepository', () => ({ DefaultWeatherRepository: jest.fn() }));

const mockGetAirport = jest.mocked(getAirport);
const mockNearby = jest.mocked(getNearbyAirports);
const mockDwd = jest.mocked(fetchDwdWarnings);
const mockRepository = jest.mocked(DefaultWeatherRepository);

describe('flight weather briefings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAirport.mockImplementation(async (_db, ident) => ({
      id: ident === 'EDAY' ? 1 : 2, ident, weatherCode: ident, iataCode: null, name: `${ident} airport`, municipality: null,
      countryCode: 'DE', regionCode: 'DE-BB', type: 'small_airport', latitude: 52.5, longitude: 13.5, elevationFt: 100
    }));
    mockNearby.mockResolvedValue([]);
    mockDwd.mockResolvedValue([]);
    mockRepository.mockImplementation(() => ({
      getWeather: async (icao: string) => ({
        icao, fetchedAt: Date.now(), isStale: false,
        metar: { icao, raw: `METAR ${icao}`, category: 'VFR', weather: ['RA'] },
        taf: { icao, raw: `TAF ${icao}`, periods: [{ weather: ['SHRA'] }] }
      }),
      getWeatherBatch: async () => ({})
    }) as unknown as DefaultWeatherRepository);
  });

  it('captures both airports and persists one timestamped snapshot', async () => {
    const db = { getFirstAsync: jest.fn().mockResolvedValue({ departure_airport: 'EDAY', arrival_airport: 'EDAV' }), runAsync: jest.fn().mockResolvedValue(undefined) } as unknown as SQLiteDatabase;
    const briefing = await generateFlightWeatherBriefing(db, 'flight-1', 'eday', 'edav');
    expect(briefing.airports.map((airport) => airport.metar)).toEqual(['METAR EDAY', 'METAR EDAV']);
    expect(briefing.airports[0]?.forecastWeather).toEqual(['SHRA']);
    expect(db.runAsync).toHaveBeenCalledTimes(1);
  });

  it('does not attach old-route weather when a flight is edited during a background request', async () => {
    const db = { getFirstAsync: jest.fn().mockResolvedValue({ departure_airport: 'EDAY', arrival_airport: 'EDCE' }), runAsync: jest.fn() } as unknown as SQLiteDatabase;
    await expect(generateFlightWeatherBriefing(db, 'flight-1', 'EDAY', 'EDAV')).rejects.toThrow('changed while weather was loading');
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it('hydrates a saved snapshot without contacting weather services', async () => {
    const payload = { airports: [{ requestedIdent: 'EDAY' }] };
    const db = { getFirstAsync: jest.fn().mockResolvedValue({ flight_id: 'flight-1', departure_airport: 'EDAY', arrival_airport: 'EDAV', generated_at: 123, payload: JSON.stringify(payload) }) } as unknown as SQLiteDatabase;
    const briefing = await getFlightWeatherBriefing(db, 'flight-1');
    expect(briefing).toMatchObject({ flightId: 'flight-1', departureAirport: 'EDAY', arrivalAirport: 'EDAV', generatedAt: 123 });
    expect(mockRepository).not.toHaveBeenCalled();
  });
  it('carries a planned briefing into the log with the original report time', async () => {
    const db = { getFirstAsync: jest.fn().mockResolvedValue({ departure_airport: 'EDAY', arrival_airport: 'EDAV' }), runAsync: jest.fn().mockResolvedValue(undefined) } as unknown as SQLiteDatabase;
    const planned = await capturePlannedWeatherBriefing(db, 'planned-1', 'EDAY', 'EDAV');
    const originalTimestamp = planned.generatedAt;
    jest.mocked(db.getFirstAsync).mockResolvedValue({ payload: JSON.stringify(planned) });
    const restored = await getPlannedWeatherBriefing(db, 'planned-1');
    await attachWeatherBriefing(db, 'log-1', restored!);
    const calls = jest.mocked(db.runAsync).mock.calls;
    expect(calls.at(-1)?.slice(1, 5)).toEqual(['log-1', 'EDAY', 'EDAV', originalTimestamp]);
    expect(JSON.parse(String(calls.at(-1)?.[5])).airports).toEqual(planned.airports);
  });
  it('does not persist an empty planned briefing as if reports were available', async () => {
    mockRepository.mockImplementation(() => ({ getWeather: async () => null, getWeatherBatch: async () => ({}) }) as unknown as DefaultWeatherRepository);
    const db = { getFirstAsync: jest.fn().mockResolvedValue({ departure_airport: 'EDAY', arrival_airport: 'EDAV' }), runAsync: jest.fn() } as unknown as SQLiteDatabase;
    await expect(capturePlannedWeatherBriefing(db, 'planned-1', 'EDAY', 'EDAV')).rejects.toThrow('No weather reports');
    expect(db.runAsync).not.toHaveBeenCalled();
  });

});

describe('route-wide planned weather', () => {
  const route = (idents: string[]) => ({ waypoints: idents.map((ident) => ({ ident, source: ident.startsWith('ED') ? 'AIRPORT' : 'CUSTOM' })) });
  beforeEach(() => { jest.clearAllMocks(); });
  it('includes each route aerodrome once and excludes custom waypoints', async () => {
    const db = { getFirstAsync: jest.fn().mockResolvedValue({ departure_airport: 'EDAY', arrival_airport: 'EDAY', route_plan_id: 'r1' }) } as unknown as SQLiteDatabase;
    jest.mocked(getRoutePlan).mockResolvedValue(route(['EDAY', 'EDCE', 'WP1', 'EDAE', 'EDCE', 'EDAY']) as never);
    expect(await getPlannedBriefingAirportIdents(db, 'p1')).toEqual(['EDAY', 'EDCE', 'EDAE']);
  });
  it('rejects an endpoint-only snapshot after intermediate aerodromes are added', async () => {
    const saved = { departureAirport: 'EDAY', arrivalAirport: 'EDAY', airports: [{ requestedIdent: 'EDAY' }] };
    const db = { getFirstAsync: jest.fn().mockImplementation(async (sql: string) => sql.includes('planned_weather_briefings') ? { payload: JSON.stringify(saved) } : { departure_airport: 'EDAY', arrival_airport: 'EDAY', route_plan_id: 'r1' }) } as unknown as SQLiteDatabase;
    jest.mocked(getRoutePlan).mockResolvedValue(route(['EDAY', 'EDCE', 'EDAY']) as never);
    expect(await getValidPlannedWeatherBriefing(db, 'p1')).toBeNull();
    saved.airports.push({ requestedIdent: 'EDCE' });
    expect(await getValidPlannedWeatherBriefing(db, 'p1')).toEqual(saved);
  });
  it('captures intermediate airports while fetching a shared reporting station only once', async () => {
    const db = { getFirstAsync: jest.fn().mockResolvedValue({ departure_airport: 'EDAY', arrival_airport: 'EDAY', route_plan_id: 'r1' }), runAsync: jest.fn() } as unknown as SQLiteDatabase;
    jest.mocked(getRoutePlan).mockResolvedValue(route(['EDAY', 'EDCE', 'EDAE', 'EDAY']) as never);
    mockGetAirport.mockImplementation(async (_db, ident) => ({ ident, name: ident, weatherCode: ident === 'EDAE' ? 'EDAE' : 'EDDB', countryCode: 'DE', latitude: 52, longitude: 13 }) as never);
    mockDwd.mockResolvedValue([]);
    const getWeather = jest.fn(async (icao: string) => ({ metar: { icao, raw: `METAR ${icao}`, weather: [] }, taf: { icao, raw: `TAF ${icao}`, periods: [] } }));
    mockRepository.mockImplementation(() => ({ getWeather, getWeatherBatch: async () => ({}) }) as unknown as DefaultWeatherRepository);
    const saved = await capturePlannedWeatherBriefing(db, 'p1', 'EDAY', 'EDAY');
    expect(saved.airports.map((airport) => airport.requestedIdent)).toEqual(['EDAY', 'EDCE', 'EDAE']);
    expect(getWeather.mock.calls.map(([icao]) => icao)).toEqual(['EDDB', 'EDAE']);
    expect(mockDwd).toHaveBeenCalledTimes(3);
    expect(db.runAsync).toHaveBeenCalledTimes(1);
  });
  it('does not save weather when route aerodromes change during capture', async () => {
    const db = { getFirstAsync: jest.fn().mockResolvedValue({ departure_airport: 'EDAY', arrival_airport: 'EDAY', route_plan_id: 'r1' }), runAsync: jest.fn() } as unknown as SQLiteDatabase;
    jest.mocked(getRoutePlan).mockResolvedValueOnce(route(['EDAY', 'EDCE', 'EDAY']) as never).mockResolvedValueOnce(route(['EDAY', 'EDAE', 'EDAY']) as never);
    await expect(capturePlannedWeatherBriefing(db, 'p1', 'EDAY', 'EDAY')).rejects.toThrow('route changed');
    expect(db.runAsync).not.toHaveBeenCalled();
  });
});
