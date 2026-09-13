import { routeTestDatabase } from '../../../test/sqlite';
import { getRoutePlan, linkRoutePlanToFlight, getFlightRouteSnapshot, saveRoutePlan } from '@/data/routePlans';
import { saveRouteEdit } from '@/data/routeEdits';
import { createPlannedFlight, getPlannedFlight, updatePlannedFlight } from '@/data/plannedFlights';
import { deleteAircraftProfile } from '@/data/aircraftProfiles';
import { saveFlightDetails } from '@/data/flightDetails';

const route = { id: 'original', title: 'EDAY to EDAZ', waypoints: [
  { id: 'a', ident: 'EDAY', name: 'Strausberg', latitude: 52.58, longitude: 13.92, source: 'AIRPORT' as const },
  { id: 'b', ident: 'EDAZ', name: 'Schoenhagen', latitude: 52.20, longitude: 13.16, source: 'AIRPORT' as const }
], cruiseSpeedKt: 100, fuelBurnPerHour: 20, fuelUnit: 'L' as const, windDirectionTrue: 270, windSpeedKt: 10,
windSource: 'MANUAL' as const, windStation: null, windStationDistanceKm: null, windObservedAt: null, airacCycle: '2609' };
async function addFlight(db: ReturnType<typeof routeTestDatabase>['db']) {
  return createPlannedFlight(db, { routePlanId: route.id, departureAirport: 'EDAY', arrivalAirport: 'EDAZ', departureDate: '2026-09-14', departureTime: '', aircraftProfileId: null, localArea: false });
}

describe('automatic route editing against SQLite', () => {
  let fixture: ReturnType<typeof routeTestDatabase>;
  beforeEach(async () => { fixture = routeTestDatabase(); await saveRoutePlan(fixture.db, route); });
  afterEach(() => fixture.sqlite.close());
  it('does not copy a shared route merely by opening it', async () => {
    const id = await addFlight(fixture.db);
    expect((await saveRouteEdit(fixture.db, route, { flightId: id })).changed).toBe(false);
    expect((await fixture.db.getAllAsync('SELECT id FROM route_plans'))).toHaveLength(1);
  });
  it('forks a shared route edited from Saved routes and protects every attached plan', async () => {
    const id = await addFlight(fixture.db);
    const edited = await saveRouteEdit(fixture.db, { ...route, title: 'Edited' }, {});
    expect(edited.copied).toBe(true);
    expect((await getPlannedFlight(fixture.db, id))?.routePlanId).toBe(route.id);
    expect((await getRoutePlan(fixture.db, route.id))?.title).toBe(route.title);
  });
  it('updates only the current plan and reuses its owned copy on subsequent autosaves', async () => {
    const id = await addFlight(fixture.db); const other = await addFlight(fixture.db);
    const first = await saveRouteEdit(fixture.db, { ...route, title: 'First edit' }, { flightId: id });
    const second = await saveRouteEdit(fixture.db, { ...route, id: first.id, title: 'Second edit' }, { flightId: id, ownedId: first.id, revision: first.revision });
    expect(second.id).toBe(first.id);
    expect((await getPlannedFlight(fixture.db, id))?.routePlanId).toBe(first.id);
    expect((await getPlannedFlight(fixture.db, other))?.routePlanId).toBe(route.id);
    expect(await fixture.db.getAllAsync('SELECT id FROM route_plans')).toHaveLength(2);
  });
  it('reuses a flight-owned route after closing and reopening the editor', async () => {
    const id = await addFlight(fixture.db);
    const first = await saveRouteEdit(fixture.db, { ...route, title: 'First edit' }, { flightId: id });
    const reopened = await saveRouteEdit(fixture.db, { ...route, id: first.id, title: 'Reopened edit' }, { flightId: id, revision: first.revision });
    expect(reopened.id).toBe(first.id);
    expect(reopened.copied).toBe(false);
    expect(await fixture.db.getAllAsync('SELECT id FROM route_plans')).toHaveLength(2);
    expect((await getRoutePlan(fixture.db, route.id))?.title).toBe(route.title);
  });
  it('does not copy a new direct draft when METAR wind arrives or the editor is reopened', async () => {
    const id = await createPlannedFlight(fixture.db, { routePlanId: route.id, departureAirport: 'EDAY', arrivalAirport: 'EDAZ', departureDate: '2026-09-13', departureTime: '', aircraftProfileId: null, localArea: false }, true);
    const wind = await saveRouteEdit(fixture.db, { ...route, windSpeedKt: 14 }, { flightId: id });
    const reopened = await saveRouteEdit(fixture.db, { ...route, title: 'Via training area', windSpeedKt: 14 }, { flightId: id, revision: wind.revision });
    expect(wind.copied).toBe(false); expect(reopened.id).toBe(route.id);
    expect(await fixture.db.getAllAsync('SELECT id FROM route_plans')).toHaveLength(1);
  });
  it('forks an owned route if another plan or a logged snapshot starts using it', async () => {
    const id = await addFlight(fixture.db);
    const first = await saveRouteEdit(fixture.db, { ...route, title: 'Working copy' }, { flightId: id });
    const other = await createPlannedFlight(fixture.db, { routePlanId: first.id, departureAirport: 'EDAY', arrivalAirport: 'EDAZ', departureDate: '2026-09-14', departureTime: '', aircraftProfileId: null, localArea: false });
    const edited = await saveRouteEdit(fixture.db, { ...route, id: first.id, title: 'Only this flight' }, { flightId: id });
    expect(edited.copied).toBe(true);
    expect((await getPlannedFlight(fixture.db, other))?.routePlanId).toBe(first.id);
    expect((await getRoutePlan(fixture.db, first.id))?.title).toBe('Working copy');
  });
  it('reuses the owned route when changing aircraft and clears only that flight performance', async () => {
    const id = await addFlight(fixture.db);
    const first = await saveRouteEdit(fixture.db, { ...route, title: 'Working route' }, { flightId: id });
    fixture.sqlite.exec("INSERT INTO aircraft_profiles VALUES ('aircraft-2', 'READY')");
    const updated = await saveFlightDetails(fixture.db, id, { departureDate: '2026-09-14', departureTime: '', aircraftProfileId: 'aircraft-2' });
    expect(updated?.routePlanId).toBe(first.id);
    expect(await fixture.db.getAllAsync('SELECT id FROM route_plans')).toHaveLength(2);
    expect((await getRoutePlan(fixture.db, first.id))?.cruiseSpeedKt).toBeNull();
    expect((await getRoutePlan(fixture.db, route.id))?.cruiseSpeedKt).toBe(100);
  });
  it('rejects plan mutations after it has been recorded', async () => {
    const id = await addFlight(fixture.db);
    fixture.sqlite.exec("INSERT INTO logbook_flights VALUES ('record', 'COMPLETE')");
    await updatePlannedFlight(fixture.db, id, { logbookFlightId: 'record' });
    await expect(updatePlannedFlight(fixture.db, id, { weightBalanceId: null, planningStatus: 'DRAFT' })).rejects.toThrow('recorded or removed');
    await expect(saveRouteEdit(fixture.db, { ...route, title: 'Changed after recording' }, { flightId: id })).rejects.toThrow('recorded');
    expect((await getRoutePlan(fixture.db, route.id))?.title).toBe(route.title);
  });
  it('keeps logged snapshots byte-for-byte unchanged and forks their source', async () => {
    fixture.sqlite.exec("INSERT INTO logbook_flights VALUES ('logged', 'COMPLETE')");
    await linkRoutePlanToFlight(fixture.db, route.id, 'logged');
    const before = await getFlightRouteSnapshot(fixture.db, 'logged');
    expect((await saveRouteEdit(fixture.db, { ...route, cruiseSpeedKt: 120 }, {})).copied).toBe(true);
    expect(await getFlightRouteSnapshot(fixture.db, 'logged')).toEqual(before);
  });
  it('refuses a stale edit instead of overwriting changes from another view', async () => {
    const original = (await getRoutePlan(fixture.db, route.id))!;
    await saveRouteEdit(fixture.db, { ...route, title: 'Other edit' }, {});
    await expect(saveRouteEdit(fixture.db, { ...route, title: 'Stale' }, { revision: original.updatedAt })).rejects.toThrow('another view');
    expect((await getRoutePlan(fixture.db, route.id))?.title).toBe('Other edit');
  });
  it('does not recreate a deleted route or leave a copy if the flight route changed', async () => {
    const id = await addFlight(fixture.db);
    await fixture.db.runAsync('UPDATE planned_flights SET route_plan_id = NULL WHERE id = ?', id);
    await fixture.db.runAsync('DELETE FROM route_plans WHERE id = ?', route.id);
    await expect(saveRouteEdit(fixture.db, route, { flightId: id })).rejects.toThrow('removed');
    expect(await fixture.db.getAllAsync('SELECT id FROM route_plans')).toHaveLength(0);
  });
  it('persists applied leg altitude immediately for a fresh navlog read', async () => {
    const edited = await saveRouteEdit(fixture.db, { ...route, waypoints: route.waypoints.map((point, i) => ({ ...point, plannedAltitudeFt: i ? 2500 : null })) }, {});
    expect((await getRoutePlan(fixture.db, edited.id))?.waypoints[1]?.plannedAltitudeFt).toBe(2500);
  });
  it('changes aircraft on the current plan, clears loading and performance, and preserves the other plan', async () => {
    const id = await addFlight(fixture.db); const other = await addFlight(fixture.db);
    fixture.sqlite.exec("INSERT INTO aircraft_profiles VALUES ('new-aircraft', 'READY')");
    await fixture.db.runAsync("UPDATE planned_flights SET weight_balance_id='loading', planning_status='READY' WHERE id=?", id);
    const updated = await saveFlightDetails(fixture.db, id, { departureDate: '2026-09-15', departureTime: '12:30', aircraftProfileId: 'new-aircraft' });
    expect(updated).toMatchObject({ aircraftProfileId: 'new-aircraft', weightBalanceId: null, planningStatus: 'DRAFT', departureDate: '2026-09-15' });
    const newRoute = (await getRoutePlan(fixture.db, updated!.routePlanId!))!;
    expect(newRoute.cruiseSpeedKt).toBeNull(); expect(newRoute.fuelBurnPerHour).toBeNull();
    expect((await getPlannedFlight(fixture.db, other))?.routePlanId).toBe(route.id);
    expect((await getRoutePlan(fixture.db, route.id))?.cruiseSpeedKt).toBe(100);
  });
  it('allows an undated draft and rejects invalid dates or unknown aircraft without partial writes', async () => {
    const id = await addFlight(fixture.db);
    await saveFlightDetails(fixture.db, id, { departureDate: '', departureTime: '', aircraftProfileId: null });
    await expect(saveFlightDetails(fixture.db, id, { departureDate: '2026-02-30', departureTime: '', aircraftProfileId: null })).rejects.toThrow('valid UTC');
    await expect(saveFlightDetails(fixture.db, id, { departureDate: '2026-09-16', departureTime: '', aircraftProfileId: 'missing' })).rejects.toThrow('ready aircraft');
    expect((await getPlannedFlight(fixture.db, id))?.departureDate).toBe('');
  });  it('retains an aircraft profile used by a plan even without a loading calculation', async () => {
    const id = await addFlight(fixture.db);
    fixture.sqlite.exec("INSERT INTO aircraft_profiles VALUES ('retained', 'READY')");
    await fixture.db.runAsync('UPDATE planned_flights SET aircraft_profile_id = ? WHERE id = ?', 'retained', id);
    await expect(deleteAircraftProfile(fixture.db, 'retained')).rejects.toThrow('used by a planned flight');
    expect(await fixture.db.getFirstAsync('SELECT id FROM aircraft_profiles WHERE id = ?', 'retained')).toBeTruthy();
  });

});
