import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { routeTestDatabase } from '../../../test/sqlite';
import { createPlannedFlight, getPlannedFlight, saveCalculationToPlannedFlight } from '../plannedFlights';
import { getWeightBalanceCalculation } from '../weightBalance';
import type { SavedWeightBalanceCalculation } from '@/domain/weightBalance';

// File-backed SQLite intentionally gives exclusive transactions their own connection, as Expo does.
describe('atomic calculation creation and planned-flight attachment', () => {
  let directory: string; let fixture: ReturnType<typeof routeTestDatabase>;
  const calculation = { profileId: 'aircraft', profileGroupId: 'group', profileRevision: 1,
    registration: 'D-TEST', title: 'Loading', calculationDate: '2026-09-13',
    input: { title: 'Loading', calculationDate: '2026-09-13', stationLoads: [] }, result: { valid: true, states: [], errors: [], warnings: [] }
  } as Parameters<typeof saveCalculationToPlannedFlight>[2];
  beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'aerobrief-db-')); fixture = routeTestDatabase(join(directory, 'test.sqlite')); });
  afterEach(() => { fixture.sqlite.close(); rmSync(directory, { recursive: true, force: true }); });
  async function plan(aircraftProfileId: string | null = 'aircraft') {
    return createPlannedFlight(fixture.db, { routePlanId: null, departureAirport: 'EDAY', arrivalAirport: 'EDCE', departureDate: '2026-09-13', departureTime: '', aircraftProfileId, localArea: false });
  }
  it('commits the new calculation and attaches it using one exclusive connection', async () => {
    const flightId = await plan();
    const id = await saveCalculationToPlannedFlight(fixture.db, flightId, calculation);
    expect(await getPlannedFlight(fixture.db, flightId)).toMatchObject({ weightBalanceId: id, aircraftProfileId: 'aircraft' });
    expect(await getWeightBalanceCalculation(fixture.db, id)).toMatchObject({ registration: 'D-TEST', input: calculation.input } satisfies Partial<SavedWeightBalanceCalculation>);
  });
  it('rolls back the calculation when the flight is missing or the aircraft changed', async () => {
    const flightId = await plan('other-aircraft');
    await expect(saveCalculationToPlannedFlight(fixture.db, flightId, calculation)).rejects.toThrow('Select this aircraft');
    await expect(saveCalculationToPlannedFlight(fixture.db, 'deleted', calculation)).rejects.toThrow('no longer exists');
    expect(await fixture.db.getAllAsync('SELECT id FROM weight_balance_calculations')).toHaveLength(0);
    expect((await getPlannedFlight(fixture.db, flightId))?.weightBalanceId).toBeNull();
  });
});
