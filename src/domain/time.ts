import SunCalc from 'suncalc';
import tzLookup from 'tz-lookup';
import type { Airport, TimeMode } from './models';

export function airportTimeZone(airport: Pick<Airport, 'latitude' | 'longitude'>): string {
  try {
    return tzLookup(airport.latitude, airport.longitude);
  } catch {
    return 'UTC';
  }
}

export function formatEpoch(
  epochSeconds: number,
  airport: Pick<Airport, 'latitude' | 'longitude'>,
  mode: TimeMode,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const timeZone = mode === 'utc' ? 'UTC' : airportTimeZone(airport);
  return new Intl.DateTimeFormat('en', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...options
  }).format(new Date(epochSeconds * 1000));
}

export function sunriseSunset(
  airport: Pick<Airport, 'latitude' | 'longitude'>,
  at: Date = new Date()
): { sunrise: Date; sunset: Date } {
  const times = SunCalc.getTimes(at, airport.latitude, airport.longitude);
  return { sunrise: times.sunrise, sunset: times.sunset };
}

export function isNightAt(
  epochSeconds: number,
  airport: Pick<Airport, 'latitude' | 'longitude'>
): boolean {
  const at = new Date(epochSeconds * 1000);
  const { sunrise, sunset } = sunriseSunset(airport, at);
  const time = at.getTime();
  const sunriseTime = sunrise.getTime();
  const sunsetTime = sunset.getTime();
  if (![time, sunriseTime, sunsetTime].every(Number.isFinite)) return false;
  return time < sunriseTime || time >= sunsetTime;
}

export function observationAge(observedAt: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - observedAt * 1000) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h ago` : `${hours}h ${remainder}m ago`;
}
