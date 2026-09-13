import type { SQLiteDatabase } from 'expo-sqlite';
import { deleteRoutePlan, getFlightRouteSnapshot, getRoutePlan, linkRoutePlanToFlight, saveFlightRoutePlan, saveRoutePlan } from '@/data/routePlans';

const row = {
  id: 'route-1', title: 'EDAY to EDAV', waypoints_json: '[]', cruise_speed_kt: 90,
  fuel_burn_per_hour: 16, fuel_unit: 'L', wind_direction_true: 240, wind_speed_kt: 8,
  wind_source: 'METAR', wind_station: 'EDAY', wind_observed_at: 123, airac_cycle: '2609', created_at: 1, updated_at: 2
};

describe('logbook route snapshots', () => {
  it('persists refreshed METAR wind and its source metadata', async () => {
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const db = { runAsync } as unknown as SQLiteDatabase;
    await saveRoutePlan(db, {
      id: 'route-1',
      title: 'EDAY to EDAV',
      waypoints: [],
      cruiseSpeedKt: 90,
      fuelBurnPerHour: 16,
      fuelUnit: 'L',
      windDirectionTrue: 240,
      windSpeedKt: 8,
      windSource: 'METAR',
      windStation: 'EDDB',
      windStationDistanceKm: 31.4,
      windObservedAt: 123,
      airacCycle: '2609'
    });
    const call = runAsync.mock.calls[0]!;
    expect(call.slice(7, 13)).toEqual([240, 8, 'METAR', 'EDDB', 31.4, 123]);
  });

  it('copies the selected plan into an immutable flight snapshot', async () => {
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue(row),
      runAsync,
      withTransactionAsync: async (task: () => Promise<void>) => task()
    } as unknown as SQLiteDatabase;
    await linkRoutePlanToFlight(db, 'route-1', 'flight-1');
    expect(runAsync).toHaveBeenCalledWith('DELETE FROM logbook_route_snapshots WHERE flight_id = ?', 'flight-1');
    const insert = runAsync.mock.calls[1];
    expect(insert?.[0]).toContain('INSERT INTO logbook_route_snapshots');
    expect(JSON.parse(String(insert?.[4])).title).toBe('EDAY to EDAV');
  });

  it('reads a saved flight snapshot even if its source plan was removed', async () => {
    const payload = { id: 'route-1', title: 'Saved route', waypoints: [], windDirectionTrue: 240, windSpeedKt: 8 };
    const db = { getFirstAsync: jest.fn().mockResolvedValue({ flight_id: 'flight-1', source_route_plan_id: null, attached_at: 456, payload: JSON.stringify(payload) }) } as unknown as SQLiteDatabase;
    const result = await getFlightRouteSnapshot(db, 'flight-1');
    expect(result?.sourceRoutePlanId).toBeNull();
    expect(result?.plan.title).toBe('Saved route');
  });

  it('normalizes legacy snapshot payloads before the navlog renders them', async () => {
    const payload = {
      title: 'Legacy route',
      waypoints: [
        { ident: 'EDAY', name: 'Strausberg', latitude: 52.58, longitude: 13.92, source: 'AIRPORT' },
        { ident: 'BROKEN', latitude: null, longitude: 13.4 },
        { latitude: 52.63, longitude: 13.77 }
      ]
    };
    const db = { getFirstAsync: jest.fn().mockResolvedValue({ flight_id: 'flight-1', source_route_plan_id: 'deleted-route', attached_at: 456, payload: JSON.stringify(payload) }) } as unknown as SQLiteDatabase;
    const result = await getFlightRouteSnapshot(db, 'flight-1');
    expect(result?.plan.waypoints).toHaveLength(2);
    expect(result?.plan.waypoints[1]?.ident).toBe('WP3');
    expect(result?.plan.fuelUnit).toBe('L');
    expect(result?.plan.windDirectionTrue).toBeNull();
  });

  it('prevents deleting a route that a planned flight still uses', async () => {
    const db = {
      getFirstAsync: jest.fn().mockResolvedValue({ count: 1 }),
      runAsync: jest.fn()
    } as unknown as SQLiteDatabase;
    await expect(deleteRoutePlan(db, 'route-1')).rejects.toThrow('used by a planned flight');
    expect(db.runAsync).not.toHaveBeenCalled();
  });
});

describe('reusing a saved route in flights', () => {
  it('does not create a duplicate when opening and saving without changes', async () => {
    const db = { getFirstAsync: jest.fn().mockResolvedValue(row), runAsync: jest.fn() } as unknown as SQLiteDatabase;
    const original = (await getRoutePlan(db, row.id))!;
    expect(await saveFlightRoutePlan(db, original)).toEqual({ id: row.id, changed: false });
    expect(db.runAsync).not.toHaveBeenCalled();
  });
  it('creates a separate route when performance or waypoint order changes', async () => {
    const db = { getFirstAsync: jest.fn().mockResolvedValue(row), runAsync: jest.fn().mockResolvedValue({ changes: 1 }) } as unknown as SQLiteDatabase;
    const original = (await getRoutePlan(db, row.id))!;
    const saved = await saveFlightRoutePlan(db, { ...original, cruiseSpeedKt: 110 });
    expect(saved.changed).toBe(true);
    expect(saved.id).not.toBe(row.id);
    const args = jest.mocked(db.runAsync).mock.calls[0]!;
    expect(args[1]).toBe(saved.id);
    expect(args[4]).toBe(110);
  });
});
