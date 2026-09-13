import geomagnetism from 'geomagnetism';

export type RouteWaypointSource = 'AIRPORT' | 'MAP';

export interface RouteWaypoint {
  id: string;
  ident: string;
  name: string;
  latitude: number;
  longitude: number;
  source: RouteWaypointSource;
  /** Planned altitude for the leg ending at this waypoint. */
  plannedAltitudeFt?: number | null;
  /** Optional pilot note for the leg ending at this waypoint. */
  legNote?: string | null;
}

export interface RoutePlan {
  id: string;
  title: string;
  waypoints: RouteWaypoint[];
  cruiseSpeedKt: number | null;
  fuelBurnPerHour: number | null;
  fuelUnit: 'L' | 'US_GAL';
  windDirectionTrue: number | null;
  windSpeedKt: number | null;
  windSource: 'METAR' | 'MANUAL' | null;
  windStation: string | null;
  windStationDistanceKm: number | null;
  windObservedAt: number | null;
  airacCycle: string;
  createdAt: number;
  updatedAt: number;
}

export interface RouteLeg {
  from: RouteWaypoint;
  to: RouteWaypoint;
  distanceNm: number;
  trueTrack: number;
  magneticVariation: number | null;
  magneticTrack: number | null;
  windCorrectionAngle: number | null;
  magneticHeading: number | null;
  groundSpeedKt: number | null;
  windSolutionPossible: boolean;
  estimatedMinutes: number | null;
  estimatedFuel: number | null;
  plannedAltitudeFt: number | null;
  note: string | null;
}

export interface RouteSummary {
  legs: RouteLeg[];
  distanceNm: number;
  estimatedMinutes: number | null;
  estimatedFuel: number | null;
}

const radians = (degrees: number): number => degrees * Math.PI / 180;
const degrees = (radiansValue: number): number => radiansValue * 180 / Math.PI;
const normalizeHeading = (value: number): number => (value % 360 + 360) % 360;

export function magneticVariation(latitude: number, longitude: number, date = new Date()): number | null {
  try {
    const result = geomagnetism.model(date, { allowOutOfBoundsModel: false }).point([latitude, longitude, 0]);
    return Number.isFinite(result.decl) ? result.decl : null;
  } catch {
    return null;
  }
}

export function windCorrectedNavigation(
  trackTrue: number,
  trueAirSpeedKt: number | null,
  windDirectionTrue: number | null,
  windSpeedKt: number | null
): { windCorrectionAngle: number | null; groundSpeedKt: number | null; possible: boolean } {
  const speed = trueAirSpeedKt !== null && Number.isFinite(trueAirSpeedKt) && trueAirSpeedKt > 0 ? trueAirSpeedKt : null;
  if (speed === null) return { windCorrectionAngle: null, groundSpeedKt: null, possible: true };
  if (windSpeedKt === 0) return { windCorrectionAngle: 0, groundSpeedKt: speed, possible: true };
  if (windDirectionTrue === null || !Number.isFinite(windDirectionTrue) || windSpeedKt === null || !Number.isFinite(windSpeedKt) || windSpeedKt < 0) {
    return { windCorrectionAngle: null, groundSpeedKt: speed, possible: true };
  }
  trueAirSpeedKt = speed;
  const relativeWind = radians(normalizeHeading(windDirectionTrue) - trackTrue);
  const ratio = windSpeedKt / trueAirSpeedKt * Math.sin(relativeWind);
  if (Math.abs(ratio) > 1) return { windCorrectionAngle: null, groundSpeedKt: null, possible: false };
  const correction = degrees(Math.asin(ratio));
  const groundSpeed = trueAirSpeedKt * Math.cos(radians(correction)) - windSpeedKt * Math.cos(relativeWind);
  if (groundSpeed <= 0) return { windCorrectionAngle: correction, groundSpeedKt: null, possible: false };
  return { windCorrectionAngle: correction, groundSpeedKt: groundSpeed, possible: true };
}

export function distanceNm(from: RouteWaypoint, to: RouteWaypoint): number {
  const earthRadiusNm = 3440.065;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusNm * Math.atan2(Math.sqrt(Math.min(1, Math.max(0, a))), Math.sqrt(1 - Math.min(1, Math.max(0, a))));
}

export function trueTrack(from: RouteWaypoint, to: RouteWaypoint): number {
  const longitudeDelta = radians(to.longitude - from.longitude);
  const fromLatitude = radians(from.latitude);
  const toLatitude = radians(to.latitude);
  const y = Math.sin(longitudeDelta) * Math.cos(toLatitude);
  const x = Math.cos(fromLatitude) * Math.sin(toLatitude)
    - Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta);
  return (degrees(Math.atan2(y, x)) + 360) % 360;
}

export function calculateRoute(
  waypoints: RouteWaypoint[],
  cruiseSpeedKt: number | null,
  fuelBurnPerHour: number | null,
  windDirectionTrue: number | null = null,
  windSpeedKt: number | null = null,
  date = new Date()
): RouteSummary {
  const usableSpeed = cruiseSpeedKt && Number.isFinite(cruiseSpeedKt) && cruiseSpeedKt > 0 ? cruiseSpeedKt : null;
  const usableBurn = fuelBurnPerHour && Number.isFinite(fuelBurnPerHour) && fuelBurnPerHour > 0 ? fuelBurnPerHour : null;
  const legs = waypoints.slice(1).map((to, index): RouteLeg => {
    const from = waypoints[index]!;
    const distance = distanceNm(from, to);
    const track = trueTrack(from, to);
    const midpointLatitude = (from.latitude + to.latitude) / 2;
    const midpointLongitude = (from.longitude + to.longitude) / 2;
    const variation = magneticVariation(midpointLatitude, midpointLongitude, date);
    const wind = windCorrectedNavigation(track, usableSpeed, windDirectionTrue, windSpeedKt);
    const estimatedMinutes = wind.groundSpeedKt ? distance / wind.groundSpeedKt * 60 : null;
    return {
      from,
      to,
      distanceNm: distance,
      trueTrack: track,
      magneticVariation: variation,
      magneticTrack: variation === null ? null : normalizeHeading(track - variation),
      windCorrectionAngle: wind.windCorrectionAngle,
      magneticHeading: variation === null || wind.windCorrectionAngle === null ? null : normalizeHeading(track + wind.windCorrectionAngle - variation),
      groundSpeedKt: wind.groundSpeedKt,
      windSolutionPossible: wind.possible,
      estimatedMinutes,
      estimatedFuel: estimatedMinutes !== null && usableBurn ? estimatedMinutes / 60 * usableBurn : null,
      plannedAltitudeFt: to.plannedAltitudeFt ?? null,
      note: to.legNote?.trim() || null
    };
  });
  const totalDistance = legs.reduce((total, leg) => total + leg.distanceNm, 0);
  const estimatedMinutes = legs.length > 0 && legs.every((leg) => leg.estimatedMinutes !== null)
    ? legs.reduce((total, leg) => total + (leg.estimatedMinutes ?? 0), 0)
    : null;
  return {
    legs,
    distanceNm: totalDistance,
    estimatedMinutes,
    estimatedFuel: estimatedMinutes !== null && usableBurn ? estimatedMinutes / 60 * usableBurn : null
  };
}

export function getAiracCycleAt(date = new Date()): string {
  const target = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  let cycleDate = Date.UTC(2003, 0, 23);
  let cycleInYear = 0;
  let cycleYear = 2003;
  while (cycleDate <= target) {
    const year = new Date(cycleDate).getUTCFullYear();
    if (year !== cycleYear) {
      cycleYear = year;
      cycleInYear = 0;
    }
    cycleInYear += 1;
    const next = cycleDate + 28 * 24 * 60 * 60 * 1000;
    if (next > target) break;
    cycleDate = next;
  }
  return `${String(cycleYear).slice(-2)}${String(cycleInYear).padStart(2, '0')}`;
}

export function formatRouteDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  const rounded = Math.round(minutes);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}
