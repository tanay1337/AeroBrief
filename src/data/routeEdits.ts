import type { SQLiteDatabase } from 'expo-sqlite';
import { getRoutePlan, routePlansEquivalent, saveRoutePlan } from '@/data/routePlans';

export interface RouteEditSession { ownedId?: string; revision?: number; flightId?: string }
/** A flight keeps its working copy across editor visits. Shared routes and snapshots remain unchanged. */
export async function saveRouteEdit(db: SQLiteDatabase, input: Parameters<typeof saveRoutePlan>[1], session: RouteEditSession) {
  let result: { id: string; changed: boolean; copied: boolean; revision: number } | undefined;
  await db.withExclusiveTransactionAsync(async (tx) => { result = await saveRouteEditWithinTransaction(tx, input, session); });
  return result!;
}

/** Call only inside an existing transaction; never opens a second SQLite connection. */
export async function saveRouteEditWithinTransaction(tx: SQLiteDatabase, input: Parameters<typeof saveRoutePlan>[1], session: RouteEditSession) {
  const original = input.id ? await getRoutePlan(tx, input.id) : null;
  if (input.id && !original) throw new Error('This route was removed. Return to Saved routes before editing.');
  if (original && session.revision !== undefined && original.updatedAt !== session.revision) throw new Error('This route changed in another view. Reopen it before editing.');
  if (original && routePlansEquivalent(original, { ...input, createdAt: original.createdAt, updatedAt: original.updatedAt })) {
    return { id: original.id, changed: false, copied: false, revision: original.updatedAt };
  }
  const flight = session.flightId ? await tx.getFirstAsync<{ route_plan_id: string | null; logbook_flight_id: string | null }>('SELECT route_plan_id, logbook_flight_id FROM planned_flights WHERE id = ?', session.flightId) : null;
  if (session.flightId && (!flight || flight.logbook_flight_id || (flight.route_plan_id && flight.route_plan_id !== input.id))) throw new Error('This flight was recorded or its route changed. Reopen the flight plan.');
  const references = original ? await tx.getFirstAsync<{ plans: number; logs: number }>(
    'SELECT (SELECT COUNT(*) FROM planned_flights WHERE route_plan_id = ?) AS plans, (SELECT COUNT(*) FROM logbook_route_snapshots WHERE source_route_plan_id = ?) AS logs', original.id, original.id
  ) : null;
  const owner = original && session.flightId ? await tx.getFirstAsync<{ flight_id: string }>('SELECT flight_id FROM route_edit_ownership WHERE route_id = ?', original.id) : null;
  const exclusivelyOwned = (session.ownedId === original?.id || (session.flightId && owner?.flight_id === session.flightId)) && (references?.logs ?? 0) === 0 && (references?.plans ?? 0) === (session.flightId ? 1 : 0);
  const copied = Boolean(original && !exclusivelyOwned && ((references?.plans ?? 0) > 0 || (references?.logs ?? 0) > 0));
  const id = await saveRoutePlan(tx, { ...input, id: copied ? '' : input.id });
  if (session.flightId && (copied || !original)) await tx.runAsync('INSERT INTO route_edit_ownership (route_id, flight_id) VALUES (?, ?)', id, session.flightId);
  // Ensure that successive writes have distinct revisions, even within one millisecond.
  const revision = Math.max(Date.now(), (original?.updatedAt ?? 0) + 1);
  await tx.runAsync('UPDATE route_plans SET updated_at = ? WHERE id = ?', revision, id);
  if (session.flightId) {
    const first = input.waypoints[0]; const last = input.waypoints.at(-1);
    await tx.runAsync(`UPDATE planned_flights SET route_plan_id = ?, planning_status = 'DRAFT',
      departure_airport = COALESCE(?, departure_airport), arrival_airport = COALESCE(?, arrival_airport),
      local_area = CASE WHEN ? IS NOT NULL AND ? IS NOT NULL THEN ? ELSE local_area END, updated_at = ? WHERE id = ?`,
    id, first?.source === 'AIRPORT' ? first.ident : null, last?.source === 'AIRPORT' ? last.ident : null,
    first?.source === 'AIRPORT' ? first.ident : null, last?.source === 'AIRPORT' ? last.ident : null,
    first?.ident === last?.ident ? 1 : 0, revision, session.flightId);
  }
  return { id, changed: true, copied, revision };
}
