import type { SQLiteDatabase } from 'expo-sqlite';
import { getPlannedFlight, updatePlannedFlight } from '@/data/plannedFlights';
import { getRoutePlan } from '@/data/routePlans';
import { saveRouteEditWithinTransaction } from '@/data/routeEdits';
import { validDepartureDate, validDepartureTime } from '@/domain/flightDetails';

export interface FlightDetailsInput { departureDate: string; departureTime: string; aircraftProfileId: string | null }
export async function saveFlightDetails(db: SQLiteDatabase, id: string, input: FlightDetailsInput) {
  if (!validDepartureDate(input.departureDate) || !validDepartureTime(input.departureTime)) throw new Error('Enter a valid UTC date and time, or leave them blank.');
  await db.withExclusiveTransactionAsync(async (tx) => {
    const flight = await getPlannedFlight(tx, id);
    if (!flight || flight.logbookFlightId) throw new Error('This flight was recorded or removed. Edit its record from the logbook.');
    const aircraftChanged = flight.aircraftProfileId !== input.aircraftProfileId;
    if (aircraftChanged && input.aircraftProfileId) {
      const profile = await tx.getFirstAsync<{ status: string }>('SELECT status FROM aircraft_profiles WHERE id = ?', input.aircraftProfileId);
      if (!profile || profile.status !== 'READY') throw new Error('Select a ready aircraft profile.');
    }
    const dateChanged = flight.departureDate !== input.departureDate || flight.departureTime !== input.departureTime;
    if (!aircraftChanged && !dateChanged) return;
    const route = aircraftChanged && flight.routePlanId ? await getRoutePlan(tx, flight.routePlanId) : null;
    const routePlanId = route ? (await saveRouteEditWithinTransaction(tx, { ...route, cruiseSpeedKt: null, fuelBurnPerHour: null }, { flightId: id })).id : flight.routePlanId;
    await updatePlannedFlight(tx, id, { ...input, planningStatus: 'DRAFT', ...(aircraftChanged ? { weightBalanceId: null, routePlanId } : {}) });
  });
  return getPlannedFlight(db, id);
}
