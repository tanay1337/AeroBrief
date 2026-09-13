import { cleanupPlannedFlightFiles } from '@/data/plannedFlightAttachments';
import { getRoutePlan } from '@/data/routePlans';
import { saveRouteEditWithinTransaction } from '@/data/routeEdits';
import { getWeightBalanceCalculation, saveWeightBalanceCalculation } from '@/data/weightBalance';
import type { SQLiteDatabase } from 'expo-sqlite';

export interface PlannedFlight {
  id: string;
  planningStatus: 'DRAFT' | 'READY';
  logbookStatus: 'DRAFT' | 'COMPLETE' | null;
  routePlanId: string | null;
  departureAirport: string;
  arrivalAirport: string;
  departureDate: string;
  departureTime: string;
  aircraftProfileId: string | null;
  weightBalanceId: string | null;
  localArea: boolean;
  logbookFlightId: string | null;
  createdAt: number;
  updatedAt: number;
}

interface PlannedFlightRow {
  planning_status?: string; logbook_status?: string;
  id: string; route_plan_id: string | null; departure_airport: string; arrival_airport: string;
  departure_date: string; departure_time: string; aircraft_profile_id: string | null;
  weight_balance_id: string | null; local_area: number; logbook_flight_id: string | null;
  created_at: number; updated_at: number;
}

const fromRow = (row: PlannedFlightRow): PlannedFlight => ({
  logbookStatus: row.logbook_status === 'COMPLETE' ? 'COMPLETE' : row.logbook_status === 'DRAFT' ? 'DRAFT' : null,
  planningStatus: row.planning_status === 'READY' ? 'READY' : 'DRAFT',
  id: row.id, routePlanId: row.route_plan_id, departureAirport: row.departure_airport,
  arrivalAirport: row.arrival_airport, departureDate: row.departure_date,
  departureTime: row.departure_time, aircraftProfileId: row.aircraft_profile_id,
  weightBalanceId: row.weight_balance_id, localArea: row.local_area === 1,
  logbookFlightId: row.logbook_flight_id, createdAt: row.created_at, updatedAt: row.updated_at
});

export async function getPlannedFlights(db: SQLiteDatabase): Promise<PlannedFlight[]> {
  const rows = await db.getAllAsync<PlannedFlightRow>('SELECT planned_flights.*, logbook_flights.status AS logbook_status FROM planned_flights LEFT JOIN logbook_flights ON planned_flights.logbook_flight_id = logbook_flights.id ORDER BY departure_date DESC, planned_flights.updated_at DESC');
  return rows.map(fromRow);
}

export async function getPlannedFlight(db: SQLiteDatabase, id: string): Promise<PlannedFlight | null> {
  const row = await db.getFirstAsync<PlannedFlightRow>('SELECT planned_flights.*, logbook_flights.status AS logbook_status FROM planned_flights LEFT JOIN logbook_flights ON planned_flights.logbook_flight_id = logbook_flights.id WHERE planned_flights.id = ?', id);
  return row ? fromRow(row) : null;
}

export async function getPlannedFlightForLogbook(db: SQLiteDatabase, logbookFlightId: string): Promise<PlannedFlight | null> {
  const row = await db.getFirstAsync<PlannedFlightRow>('SELECT * FROM planned_flights WHERE logbook_flight_id = ? LIMIT 1', logbookFlightId);
  return row ? fromRow(row) : null;
}

export async function createPlannedFlight(db: SQLiteDatabase, input: Pick<PlannedFlight, 'routePlanId' | 'departureAirport' | 'arrivalAirport' | 'departureDate' | 'departureTime' | 'aircraftProfileId' | 'localArea'>, ownsNewRoute = false): Promise<string> {
  const id = `planned-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = Date.now();
  await db.runAsync('INSERT INTO planned_flights (id, route_plan_id, departure_airport, arrival_airport, departure_date, departure_time, aircraft_profile_id, local_area, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, input.routePlanId, input.departureAirport, input.arrivalAirport, input.departureDate,
    input.departureTime, input.aircraftProfileId, input.localArea ? 1 : 0, now, now);
  if (ownsNewRoute && input.routePlanId) await db.runAsync('INSERT INTO route_edit_ownership (route_id, flight_id) VALUES (?, ?)', input.routePlanId, id);
  return id;
}

export async function updatePlannedFlight(db: SQLiteDatabase, id: string, changes: Partial<Pick<PlannedFlight, 'aircraftProfileId' | 'planningStatus' | 'routePlanId' | 'weightBalanceId' | 'logbookFlightId' | 'departureAirport' | 'arrivalAirport' | 'localArea' | 'departureDate' | 'departureTime'>>): Promise<void> {
  const fields: string[] = [];
  const values: (string | null | number)[] = [];
  for (const [key, column] of [['aircraftProfileId', 'aircraft_profile_id'], ['planningStatus', 'planning_status'], ['routePlanId', 'route_plan_id'], ['weightBalanceId', 'weight_balance_id'], ['logbookFlightId', 'logbook_flight_id'], ['departureAirport', 'departure_airport'], ['arrivalAirport', 'arrival_airport'], ['localArea', 'local_area'], ['departureDate', 'departure_date'], ['departureTime', 'departure_time']] as const) {
    if (Object.prototype.hasOwnProperty.call(changes, key)) {
      fields.push(`${column} = ?`);
      values.push(key === 'localArea' ? (changes.localArea ? 1 : 0) : (changes[key] ?? null));
    }
  }
  if (!fields.length) return;
  const changesPlan = fields.some((field) => !field.startsWith('logbook_flight_id'));
  const result = await db.runAsync(`UPDATE planned_flights SET ${fields.join(', ')}, updated_at = ? WHERE id = ?${changesPlan ? ' AND logbook_flight_id IS NULL' : ''}`, ...values, Date.now(), id);
  if (!result.changes) throw new Error('This flight was recorded or removed. Update its record from the logbook.');
}

export async function deletePlannedFlight(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM planned_flights WHERE id = ?', id);
  try { cleanupPlannedFlightFiles(id); } catch { /* Local cleanup must not undo a successful flight deletion. */ }
}

export async function attachCalculationToPlannedFlight(db: SQLiteDatabase, flightId: string, calculationId: string): Promise<void> {
  await db.withExclusiveTransactionAsync((tx) => attachCalculationWithinTransaction(tx, flightId, calculationId));
}

/** Expo's exclusive transaction has its own connection. Create and attach on that same connection. */
export async function saveCalculationToPlannedFlight(db: SQLiteDatabase, flightId: string, input: Parameters<typeof saveWeightBalanceCalculation>[1]): Promise<string> {
  let id = '';
  await db.withExclusiveTransactionAsync(async (tx) => {
    id = await saveWeightBalanceCalculation(tx, input);
    await attachCalculationWithinTransaction(tx, flightId, id);
  });
  return id;
}

async function attachCalculationWithinTransaction(tx: SQLiteDatabase, flightId: string, calculationId: string): Promise<void> {
  const [flight, calculation] = await Promise.all([getPlannedFlight(tx, flightId), getWeightBalanceCalculation(tx, calculationId)]);
  if (!flight || !calculation) throw new Error('The flight or calculation no longer exists.');
  if (flight.logbookFlightId) throw new Error('This flight has been recorded. Update its loading from the logbook.');
  if (calculation.logbookFlightId) throw new Error('This calculation is attached to another flight. Start a new calculation.');
  if (flight.aircraftProfileId && calculation.profileId !== flight.aircraftProfileId) throw new Error('Select this aircraft in Flight details before attaching its calculation.');
  const other = await tx.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM planned_flights WHERE weight_balance_id = ? AND id <> ?', calculationId, flightId);
  if ((other?.count ?? 0) > 0) throw new Error('This calculation is used by another plan. Start a new calculation for this flight.');
  const route = !flight.aircraftProfileId && flight.routePlanId ? await getRoutePlan(tx, flight.routePlanId) : null;
  const revisedId = route && (route.cruiseSpeedKt !== null || route.fuelBurnPerHour !== null) ? (await saveRouteEditWithinTransaction(tx, { ...route, cruiseSpeedKt: null, fuelBurnPerHour: null }, { flightId })).id : null;
  await updatePlannedFlight(tx, flightId, { weightBalanceId: calculationId, aircraftProfileId: calculation.profileId, planningStatus: 'DRAFT', ...(revisedId ? { routePlanId: revisedId } : {}) });
}
