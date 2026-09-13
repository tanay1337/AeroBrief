import type { SQLiteDatabase } from 'expo-sqlite';
import type { Airport } from '@/domain/models';
import { getAirportsNearCoordinate, getNearbyAirports, initializeDatabase } from '../database';

const origin: Airport = {
  id: 1, ident: 'EDAY', weatherCode: 'EDAY', iataCode: null,
  name: 'Strausberg Airfield', municipality: 'Strausberg', countryCode: 'DE',
  regionCode: 'DE-BB', type: 'small_airport', latitude: 52.580555,
  longitude: 13.916667, elevationFt: 262
};

describe('nearby airport lookup', () => {
  it('sorts candidates by great-circle distance and applies the radius', async () => {
    const db = {
      getAllAsync: jest.fn().mockResolvedValue([
        {
          id: 3, ident: 'EDDB', weather_code: 'EDDB', iata_code: 'BER',
          name: 'Berlin Brandenburg Airport', municipality: 'Berlin', country_code: 'DE',
          region_code: 'DE-BB', type: 'large_airport', latitude: 52.361738,
          longitude: 13.502341, elevation_ft: 157
        },
        {
          id: 2, ident: 'EDBW', weather_code: 'EDBW', iata_code: null,
          name: 'Werneuchen Airfield', municipality: 'Werneuchen', country_code: 'DE',
          region_code: 'DE-BB', type: 'small_airport', latitude: 52.632778,
          longitude: 13.767222, elevation_ft: 262
        },
        {
          id: 4, ident: 'FAR', weather_code: 'FAR', iata_code: null,
          name: 'Far Away', municipality: null, country_code: 'DE', region_code: 'DE-BB',
          type: 'small_airport', latitude: 54, longitude: 14, elevation_ft: 10
        }
      ])
    } as unknown as SQLiteDatabase;

    const result = await getNearbyAirports(db, origin, { radiusKm: 80, limit: 5, weatherStationsOnly: true });
    expect(result.map(({ airport }) => airport.ident)).toEqual(['EDBW', 'EDDB']);
    expect(result[0]?.distanceKm).toBeLessThan(result[1]?.distanceKm ?? 0);
  });
});

describe('coordinate airport lookup', () => {
  it('offers nearby aerodromes in distance order for a long press', async () => {
    const db = { getAllAsync: jest.fn().mockResolvedValue([
      { id: 3, ident: 'EDDB', weather_code: 'EDDB', iata_code: 'BER', name: 'Berlin Brandenburg Airport', municipality: 'Berlin', country_code: 'DE', region_code: 'DE-BB', type: 'large_airport', latitude: 52.361738, longitude: 13.502341, elevation_ft: 157 },
      { id: 2, ident: 'EDBW', weather_code: 'EDBW', iata_code: null, name: 'Werneuchen Airfield', municipality: 'Werneuchen', country_code: 'DE', region_code: 'DE-BB', type: 'small_airport', latitude: 52.632778, longitude: 13.767222, elevation_ft: 262 }
    ]) } as unknown as SQLiteDatabase;
    const result = await getAirportsNearCoordinate(db, 52.61, 13.80, { radiusKm: 50 });
    expect(result.map(({ airport }) => airport.ident)).toEqual(['EDBW', 'EDDB']);
  });
});

describe('local schema', () => {
  it('adds aircraft profiles, immutable mass and balance calculations, and flight weather briefings', async () => {
    const execAsync = jest.fn().mockResolvedValue(undefined);
    await initializeDatabase({ execAsync } as unknown as SQLiteDatabase);
    const schema = String(execAsync.mock.calls[0]?.[0]);
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS aircraft_profiles');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS aircraft_envelope_points');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS weight_balance_calculations');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS logbook_weather_briefings');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS logbook_route_snapshots');
    expect(schema).toContain("category TEXT NOT NULL DEFAULT 'GENERAL'");
    expect(schema).toContain('FOREIGN KEY (logbook_flight_id) REFERENCES logbook_flights(id) ON DELETE SET NULL');
  });
});
