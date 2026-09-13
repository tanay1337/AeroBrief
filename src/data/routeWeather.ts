import type { SQLiteDatabase } from 'expo-sqlite';
import { getAirport, getAirportsNearCoordinate } from '@/data/database';
import { DefaultWeatherRepository } from '@/data/weatherRepository';
import type { MetarObservation } from '@/domain/models';
import type { RouteWaypoint } from '@/domain/routePlanning';

export interface RouteMetarWind {
  report: MetarObservation;
  station: string;
  distanceKm: number;
}

/**
 * Finds the nearest reporting METAR station to the route departure. The
 * departure's own station is preferred, then reporting aerodromes within
 * 120 km are checked in distance order, matching Weather and Airports.
 */
export async function getRouteMetarWind(
  db: SQLiteDatabase,
  departure: RouteWaypoint,
  force = false
): Promise<RouteMetarWind | null> {
  const airport = departure.source === 'AIRPORT' ? await getAirport(db, departure.ident) : null;
  const directStation = airport?.weatherCode
    ?? (/^[A-Z0-9]{4}$/.test(departure.ident) ? departure.ident : null);
  const nearby = await getAirportsNearCoordinate(db, departure.latitude, departure.longitude, {
    radiusKm: 120,
    limit: 24,
    weatherStationsOnly: true
  });
  const candidates: { station: string; distanceKm: number }[] = [];
  if (directStation) candidates.push({ station: directStation, distanceKm: 0 });
  for (const candidate of nearby) {
    const station = candidate.airport.weatherCode;
    if (!station || candidates.some((item) => item.station === station)) continue;
    candidates.push({ station, distanceKm: candidate.distanceKm });
  }
  if (!candidates.length) return null;

  const repository = new DefaultWeatherRepository(db);
  const weather = await repository.getWeatherBatch(candidates.map((candidate) => candidate.station), force);
  for (const candidate of candidates) {
    const report = weather[candidate.station]?.metar;
    if (report) return { report, station: candidate.station, distanceKm: candidate.distanceKm };
  }
  return null;
}
