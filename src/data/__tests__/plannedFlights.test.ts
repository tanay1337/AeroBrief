import type { SQLiteDatabase } from 'expo-sqlite';
import { initializeDatabase } from '@/data/database';
import { attachCalculationToPlannedFlight, createPlannedFlight, getPlannedFlight, getPlannedFlightForLogbook, updatePlannedFlight } from '@/data/plannedFlights';

describe('planned flight continuity', () => {
  it('adds drafts on existing local databases without changing saved route or logbook tables', async () => {
    const execAsync = jest.fn().mockResolvedValue(undefined);
    const db = { execAsync, getAllAsync: jest.fn().mockResolvedValue([]) } as unknown as SQLiteDatabase;
    await initializeDatabase(db);
    const migration = String(execAsync.mock.calls[0]?.[0]);
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS planned_flights');
    expect(migration).toContain('FOREIGN KEY (route_plan_id) REFERENCES route_plans(id) ON DELETE SET NULL');
    expect(migration).toContain('FOREIGN KEY (logbook_flight_id) REFERENCES logbook_flights(id) ON DELETE SET NULL');
  });

  it('preserves flight details while attaching a revised route and a logbook record', async () => {
    const row = {
      id: 'planned-1', route_plan_id: 'route-1', departure_airport: 'EDAY', arrival_airport: 'EDAZ',
      departure_date: '2026-09-14', departure_time: '12:30', aircraft_profile_id: null,
      weight_balance_id: null, local_area: 0, logbook_flight_id: null, created_at: 1, updated_at: 1
    };
    const runAsync = jest.fn().mockResolvedValue({ changes: 1 });
    const db = { getFirstAsync: jest.fn().mockResolvedValue(row), runAsync } as unknown as SQLiteDatabase;
    expect(await getPlannedFlight(db, 'planned-1')).toMatchObject({ departureDate: '2026-09-14', departureTime: '12:30', routePlanId: 'route-1' });
    await updatePlannedFlight(db, 'planned-1', { routePlanId: 'route-2', logbookFlightId: 'flight-1' });
    expect(runAsync.mock.calls[0]?.[0]).toContain('route_plan_id = ?, logbook_flight_id = ?');
    expect(runAsync.mock.calls[0]?.slice(1, 3)).toEqual(['route-2', 'flight-1']);
    await createPlannedFlight(db, { routePlanId: 'route-3', departureAirport: 'EDAY', arrivalAirport: 'EDAY', departureDate: '2026-09-14', departureTime: '', aircraftProfileId: null, localArea: true });
    expect(runAsync.mock.calls[1]?.[0]).toContain('INSERT INTO planned_flights');
    expect(runAsync.mock.calls[1]?.[8]).toBe(1);
  });

  it('can find a draft before its linked logbook record is deleted', async () => {
    const row = { id: 'planned-1', logbook_flight_id: 'logged-1', route_plan_id: 'route-1', departure_airport: 'EDAY', arrival_airport: 'EDAY', departure_date: '2026-09-12', departure_time: '', aircraft_profile_id: null, weight_balance_id: null, local_area: 1, created_at: 1, updated_at: 1 };
    const db = { getFirstAsync: jest.fn().mockResolvedValue(row) } as unknown as SQLiteDatabase;
    expect((await getPlannedFlightForLogbook(db, 'logged-1'))?.id).toBe('planned-1');
    expect(db.getFirstAsync).toHaveBeenCalledWith(expect.stringContaining('WHERE logbook_flight_id = ?'), 'logged-1');
  });
  it('keeps existing plans as drafts until the pilot finishes planning', async () => {
    const row = { id: 'p', departure_airport: 'EDAY', arrival_airport: 'EDCE', planning_status: undefined as string | undefined };
    const db = { getFirstAsync: jest.fn().mockResolvedValue(row), runAsync: jest.fn().mockResolvedValue({ changes: 1 }) } as unknown as SQLiteDatabase;
    expect((await getPlannedFlight(db, 'p'))?.planningStatus).toBe('DRAFT');
    await updatePlannedFlight(db, 'p', { planningStatus: 'READY' });
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('planning_status = ?'), 'READY', expect.any(Number), 'p');
    row.planning_status = 'READY';
    expect((await getPlannedFlight(db, 'p'))?.planningStatus).toBe('READY');
  });

});

describe('mass and balance from the flight brief', () => {
  const flight = { id: 'p1', route_plan_id: 'r1', departure_airport: 'EDAY', arrival_airport: 'EDCE', departure_date: '2026-09-20', logbook_flight_id: null };
  const calculation = { id: 'c1', profile_id: 'aircraft-1', input_json: '{}', result_json: '{}', logbook_flight_id: null as string | null };
  it('attaches the calculation and corresponding aircraft without changing the route or departure date', async () => {
    const runAsync = jest.fn().mockResolvedValue({ changes: 1 });
    const db = { runAsync, withExclusiveTransactionAsync: async (task: (tx: SQLiteDatabase) => Promise<void>) => task(db), getFirstAsync: jest.fn().mockImplementation(async (sql: string) => sql.includes('FROM weight_balance_calculations') ? calculation : flight) } as unknown as SQLiteDatabase;
    await attachCalculationToPlannedFlight(db, 'p1', 'c1');
    const [sql, ...values] = runAsync.mock.calls[0]!;
    expect(sql).toContain('aircraft_profile_id = ?, planning_status = ?, weight_balance_id = ?');
    expect(sql).not.toContain('route_plan_id =');
    expect(sql).not.toContain('departure_date =');
    expect(values.slice(0, 3)).toEqual(['aircraft-1', 'DRAFT', 'c1']);
  });
  it('rejects a calculation linked to a different flight', async () => {
    const runAsync = jest.fn();
    const db = { runAsync, withExclusiveTransactionAsync: async (task: (tx: SQLiteDatabase) => Promise<void>) => task(db), getFirstAsync: jest.fn().mockImplementation(async (sql: string) => sql.includes('FROM weight_balance_calculations') ? { ...calculation, logbook_flight_id: 'another-flight' } : flight) } as unknown as SQLiteDatabase;
    await expect(attachCalculationToPlannedFlight(db, 'p1', 'c1')).rejects.toThrow('another flight');
    expect(runAsync).not.toHaveBeenCalled();
  });
});
