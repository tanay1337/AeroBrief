import type { SQLiteDatabase } from 'expo-sqlite';
import type { RoutePlan, RouteWaypoint } from '@/domain/routePlanning';

interface RoutePlanRow {
  id: string;
  title: string;
  waypoints_json: string;
  cruise_speed_kt: number | null;
  fuel_burn_per_hour: number | null;
  fuel_unit: RoutePlan['fuelUnit'];
  wind_direction_true: number | null;
  wind_speed_kt: number | null;
  wind_source: RoutePlan['windSource'];
  wind_station: string | null;
  wind_station_distance_km: number | null;
  wind_observed_at: number | null;
  airac_cycle: string;
  created_at: number;
  updated_at: number;
}

function fromRow(row: RoutePlanRow): RoutePlan {
  let waypoints: RouteWaypoint[] = [];
  try {
    const parsed = JSON.parse(row.waypoints_json) as RouteWaypoint[];
    if (Array.isArray(parsed)) waypoints = parsed;
  } catch {
    // A damaged plan remains visible and can be repaired or deleted by the pilot.
  }
  return normalizeRoutePlan({
    id: row.id,
    title: row.title,
    waypoints,
    cruiseSpeedKt: row.cruise_speed_kt,
    fuelBurnPerHour: row.fuel_burn_per_hour,
    fuelUnit: row.fuel_unit,
    windDirectionTrue: row.wind_direction_true,
    windSpeedKt: row.wind_speed_kt,
    windSource: row.wind_source ?? null,
    windStation: row.wind_station ?? null,
    windStationDistanceKm: row.wind_station_distance_km ?? null,
    windObservedAt: row.wind_observed_at ?? null,
    airacCycle: row.airac_cycle,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

const finiteNumberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function normalizeWaypoints(value: unknown): RouteWaypoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const point = candidate as Partial<RouteWaypoint>;
    const latitude = finiteNumberOrNull(point.latitude);
    const longitude = finiteNumberOrNull(point.longitude);
    if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return [];
    const ident = typeof point.ident === 'string' && point.ident.trim() ? point.ident.trim() : `WP${index + 1}`;
    return [{
      id: typeof point.id === 'string' && point.id ? point.id : `snapshot-waypoint-${index}-${latitude}-${longitude}`,
      ident,
      name: typeof point.name === 'string' && point.name.trim() ? point.name : ident,
      latitude,
      longitude,
      source: point.source === 'AIRPORT' ? 'AIRPORT' : 'MAP',
      plannedAltitudeFt: finiteNumberOrNull(point.plannedAltitudeFt),
      legNote: typeof point.legNote === 'string' ? point.legNote : null
    }];
  });
}

/** Keeps older or partially damaged saved snapshots readable without trusting their JSON shape. */
function normalizeRoutePlan(value: unknown): RoutePlan {
  const plan = value && typeof value === 'object' ? value as Partial<RoutePlan> : {};
  const now = Date.now();
  return {
    id: typeof plan.id === 'string' ? plan.id : '',
    title: typeof plan.title === 'string' && plan.title.trim() ? plan.title : 'Saved route',
    waypoints: normalizeWaypoints(plan.waypoints),
    cruiseSpeedKt: finiteNumberOrNull(plan.cruiseSpeedKt),
    fuelBurnPerHour: finiteNumberOrNull(plan.fuelBurnPerHour),
    fuelUnit: plan.fuelUnit === 'US_GAL' ? 'US_GAL' : 'L',
    windDirectionTrue: finiteNumberOrNull(plan.windDirectionTrue),
    windSpeedKt: finiteNumberOrNull(plan.windSpeedKt),
    windSource: plan.windSource === 'METAR' || plan.windSource === 'MANUAL' ? plan.windSource : null,
    windStation: typeof plan.windStation === 'string' ? plan.windStation : null,
    windStationDistanceKm: finiteNumberOrNull(plan.windStationDistanceKm),
    windObservedAt: finiteNumberOrNull(plan.windObservedAt),
    airacCycle: typeof plan.airacCycle === 'string' ? plan.airacCycle : '',
    createdAt: finiteNumberOrNull(plan.createdAt) ?? now,
    updatedAt: finiteNumberOrNull(plan.updatedAt) ?? now
  };
}

export async function getRoutePlans(db: SQLiteDatabase): Promise<RoutePlan[]> {
  const rows = await db.getAllAsync<RoutePlanRow>('SELECT * FROM route_plans ORDER BY updated_at DESC');
  return rows.map(fromRow);
}

export async function getRoutePlan(db: SQLiteDatabase, id: string): Promise<RoutePlan | null> {
  const row = await db.getFirstAsync<RoutePlanRow>('SELECT * FROM route_plans WHERE id = ?', id);
  return row ? fromRow(row) : null;
}

export async function saveRoutePlan(
  db: SQLiteDatabase,
  input: Pick<RoutePlan, 'id' | 'title' | 'waypoints' | 'cruiseSpeedKt' | 'fuelBurnPerHour' | 'fuelUnit' | 'windDirectionTrue' | 'windSpeedKt' | 'windSource' | 'windStation' | 'windStationDistanceKm' | 'windObservedAt' | 'airacCycle'>
): Promise<string> {
  const now = Date.now();
  const id = input.id || `route-${now}-${Math.random().toString(36).slice(2, 9)}`;
  await db.runAsync(
    `INSERT INTO route_plans (id, title, waypoints_json, cruise_speed_kt, fuel_burn_per_hour, fuel_unit, wind_direction_true, wind_speed_kt, wind_source, wind_station, wind_station_distance_km, wind_observed_at, airac_cycle, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       waypoints_json = excluded.waypoints_json,
       cruise_speed_kt = excluded.cruise_speed_kt,
       fuel_burn_per_hour = excluded.fuel_burn_per_hour,
       fuel_unit = excluded.fuel_unit,
       wind_direction_true = excluded.wind_direction_true,
       wind_speed_kt = excluded.wind_speed_kt,
       wind_source = excluded.wind_source,
       wind_station = excluded.wind_station,
       wind_station_distance_km = excluded.wind_station_distance_km,
       wind_observed_at = excluded.wind_observed_at,
       airac_cycle = excluded.airac_cycle,
       updated_at = excluded.updated_at`,
    id,
    input.title.trim() || 'Untitled route',
    JSON.stringify(input.waypoints),
    input.cruiseSpeedKt,
    input.fuelBurnPerHour,
    input.fuelUnit,
    input.windDirectionTrue,
    input.windSpeedKt,
    input.windSource,
    input.windStation,
    input.windStationDistanceKm,
    input.windObservedAt,
    input.airacCycle,
    now,
    now
  );
  return id;
}

export interface FlightRouteSnapshot {
  flightId: string;
  sourceRoutePlanId: string | null;
  attachedAt: number;
  plan: RoutePlan;
}

interface FlightRouteSnapshotRow {
  flight_id: string;
  source_route_plan_id: string | null;
  attached_at: number;
  payload: string;
}

export async function getFlightRouteSnapshot(db: SQLiteDatabase, flightId: string): Promise<FlightRouteSnapshot | null> {
  const row = await db.getFirstAsync<FlightRouteSnapshotRow>('SELECT * FROM logbook_route_snapshots WHERE flight_id = ?', flightId);
  if (!row) return null;
  try {
    return { flightId: row.flight_id, sourceRoutePlanId: row.source_route_plan_id, attachedAt: row.attached_at, plan: normalizeRoutePlan(JSON.parse(row.payload)) };
  } catch {
    return null;
  }
}

export async function linkRoutePlanToFlight(db: SQLiteDatabase, routePlanId: string | null, flightId: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM logbook_route_snapshots WHERE flight_id = ?', flightId);
    if (!routePlanId) return;
    const plan = await getRoutePlan(db, routePlanId);
    if (!plan) throw new Error('The selected route could not be found.');
    await db.runAsync(
      'INSERT INTO logbook_route_snapshots (flight_id, source_route_plan_id, attached_at, payload) VALUES (?, ?, ?, ?)',
      flightId,
      plan.id,
      Date.now(),
      JSON.stringify(plan)
    );
  });
}

export async function deleteRoutePlan(db: SQLiteDatabase, id: string): Promise<void> {
  const linked = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM planned_flights WHERE route_plan_id = ?', id);
  if ((linked?.count ?? 0) > 0) throw new Error('This route is used by a planned flight. Delete that flight draft first.');
  await db.runAsync('DELETE FROM route_plans WHERE id = ?', id);
}

/** Ignore storage identity when deciding whether a flight needs its own edited route. */
export function routePlansEquivalent(a: RoutePlan, b: RoutePlan): boolean {
  const content = (plan: RoutePlan) => JSON.stringify({
    title: plan.title, waypoints: normalizeWaypoints(plan.waypoints), cruiseSpeedKt: plan.cruiseSpeedKt,
    fuelBurnPerHour: plan.fuelBurnPerHour, fuelUnit: plan.fuelUnit, windDirectionTrue: plan.windDirectionTrue,
    windSpeedKt: plan.windSpeedKt, windSource: plan.windSource, windStation: plan.windStation,
    windStationDistanceKm: plan.windStationDistanceKm, windObservedAt: plan.windObservedAt, airacCycle: plan.airacCycle
  });
  return content(a) === content(b);
}

export async function saveFlightRoutePlan(db: SQLiteDatabase, input: Parameters<typeof saveRoutePlan>[1]): Promise<{ id: string; changed: boolean }> {
  const original = input.id ? await getRoutePlan(db, input.id) : null;
  if (original && routePlansEquivalent(original, { ...input, createdAt: original.createdAt, updatedAt: original.updatedAt })) return { id: original.id, changed: false };
  return { id: await saveRoutePlan(db, { ...input, id: '' }), changed: true };
}
