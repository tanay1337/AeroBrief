import type { AircraftProfile } from '@/domain/aircraft';
import type { RoutePlan } from '@/domain/routePlanning';
import { calculateRoute } from '@/domain/routePlanning';
import { calculateFuelPlan, type SavedWeightBalanceCalculation } from '@/domain/weightBalance';

export interface RouteFuelCheck {
  status: 'incomplete' | 'shortfall' | 'covered';
  message: string;
  notes: string[];
  unit: 'L' | 'US_GAL';
  onboard?: number; trip?: number; taxi?: number; contingency?: number; reserve?: number; extra?: number; required?: number; margin?: number;
  reserveMinutes?: number;
}
const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const registration = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Compares saved planning assumptions. Never certifies legal dispatch or usable fuel. */
export function checkRouteFuel(route: RoutePlan, calculation: SavedWeightBalanceCalculation, profile: AircraftProfile, flight: { callsign: string; date: string; departureAirport: string; arrivalAirport: string }): RouteFuelCheck {
  const unit = profile.fuelVolumeUnit;
  const incomplete = (message: string): RouteFuelCheck => ({ status: 'incomplete', message, unit, notes: [] });
  if (profile.id !== calculation.profileId || profile.revision !== calculation.profileRevision ||
      !registration(flight.callsign) || registration(flight.callsign) !== registration(calculation.registration) || registration(profile.registration) !== registration(calculation.registration)) return incomplete('Aircraft or profile revision does not match the log.');
  if (!calculation.result.valid) return incomplete('Resolve the attached Mass and Balance errors first.');
  if (route.waypoints.length < 2 || route.waypoints[0]?.ident.toUpperCase() !== flight.departureAirport.toUpperCase() || route.waypoints.at(-1)?.ident.toUpperCase() !== flight.arrivalAirport.toUpperCase()) return incomplete('The attached route endpoints do not match this log.');
  const summary = calculateRoute(route.waypoints, route.cruiseSpeedKt, route.fuelBurnPerHour, route.windDirectionTrue, route.windSpeedKt);
  if (summary.estimatedFuel === null || !valid(summary.estimatedFuel) || summary.estimatedMinutes === null || summary.estimatedMinutes <= 0 || !route.fuelBurnPerHour || !valid(route.fuelBurnPerHour) || summary.legs.some((leg) => !leg.windSolutionPossible)) return incomplete('Enter valid route speed, consumption, and wind before checking fuel.');
  const fuelStations = profile.stations.filter((s) => s.type === 'FUEL');
  const loads = fuelStations.map((s) => calculation.input.stationLoads.find((l) => l.stationId === s.id));
  if (!loads.length || loads.some((l) => !l) || new Set(calculation.input.stationLoads.map((l) => l.stationId)).size !== calculation.input.stationLoads.length) return incomplete('Fuel-tank loads are missing or duplicated.');
  const tanks = loads.filter((l) => l !== undefined);
  if (tanks.some((l) => ![l.blockVolume, l.taxiVolume, l.tripVolume].every(valid) || [l.fuelFlowPerHour, l.cruiseMinutes, l.reserveMinutes, l.contingencyPercent, l.approachDepartureVolume, l.extraVolume].some((v) => v !== undefined && !valid(v)))) return incomplete('The saved fuel plan contains invalid quantities.');
  const factor = route.fuelUnit === unit ? 1 : route.fuelUnit === 'US_GAL' ? 3.785411784 : 1 / 3.785411784;
  const routeFlow = route.fuelBurnPerHour * factor;
  const selectedFlow = tanks.reduce((s, l) => s + (l.fuelFlowPerHour ?? 0), 0);
  const plans = tanks.map(calculateFuelPlan);
  const sum = (key: 'taxiVolume' | 'approachDepartureVolume' | 'extraVolume') => plans.reduce((s, p) => s + p[key], 0);
  const onboard = tanks.reduce((s, l) => s + l.blockVolume, 0);
  const taxi = sum('taxiVolume');
  const routeTrip = summary.estimatedFuel * factor;
  const savedTrip = tanks.reduce((s, l, i) => s + (plans[i]!.hasPlanningData ? plans[i]!.airborneVolume : l.tripVolume), 0);
  const trip = Math.max(routeTrip + sum('approachDepartureVolume'), savedTrip);
  const contingency = Math.max(routeTrip * Math.max(0, ...tanks.map((l) => l.contingencyPercent ?? 0)) / 100, plans.reduce((sum, plan) => sum + plan.contingencyVolume, 0));
  const reserveMinutes = Math.max(30, ...tanks.map((l) => l.reserveMinutes ?? 30));
  const reserve = Math.max(routeFlow, selectedFlow) * reserveMinutes / 60;
  const extra = sum('extraVolume');
  const required = taxi + trip + contingency + reserve + extra;
  const margin = onboard - required;
  const notes = ['Uses the greater of route and saved trip fuel, plus the selected allowances. Confirm that fuel on board is usable fuel.', 'Reserve is the selected planning reserve (minimum 30 minutes), not a verified legal minimum. Confirm day/night, flight rules, alternate fuel, and the applicable operation before departure.'];
  if (Math.abs(routeFlow - selectedFlow) > routeFlow * .01 && selectedFlow > 0) notes.push('Route and Mass and Balance consumption rates differ; reserve uses the higher total rate.');
  if (calculation.calculationDate !== flight.date) notes.push('The Mass and Balance calculation is dated differently from this log.');
  if (route.windSource === 'METAR') notes.push('Route fuel uses the saved surface METAR wind, which may differ from wind at cruise altitude.');
  return { status: margin < -1e-8 ? 'shortfall' : 'covered', message: margin < -1e-8 ? 'Fuel shortfall against the attached plan' : 'Selected fuel plan covered; verify reserve requirements', unit, onboard, trip, taxi, contingency, reserve, extra, required, margin, reserveMinutes, notes };
}
