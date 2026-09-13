import type { UnitPreferences } from './models';

const round = (value: number, digits = 0): string => value.toFixed(digits);

export function formatSpeed(knots: number | null, unit: UnitPreferences['speed']): string {
  if (knots === null) return '—';
  switch (unit) {
    case 'kmh': return `${round(knots * 1.852)} km/h`;
    case 'mph': return `${round(knots * 1.15078)} mph`;
    case 'ms': return `${round(knots * 0.514444, 1)} m/s`;
    default: return `${round(knots)} kt`;
  }
}

export function formatVisibility(
  sm: number | null,
  unit: UnitPreferences['visibility'],
  options: {
    qualifier?: 'LESS_THAN' | 'MORE_THAN' | null;
    tenKmOrMore?: boolean;
  } = {}
): string {
  if (sm === null) return '—';
  if (unit === 'km' && options.tenKmOrMore) return '10 km+';
  const prefix = options.qualifier === 'LESS_THAN' ? '<' : '';
  const suffix = options.qualifier === 'MORE_THAN' ? '+' : '';
  return unit === 'km'
    ? `${prefix}${round(sm * 1.60934, 1)} km${suffix}`
    : `${prefix}${round(sm, 1)} sm${suffix}`;
}

export function formatAltitude(ft: number | null, unit: UnitPreferences['altitude']): string {
  if (ft === null) return '—';
  return unit === 'm' ? `${round(ft * 0.3048)} m` : `${round(ft)} ft`;
}

export function formatTemperature(celsius: number | null, unit: UnitPreferences['temperature']): string {
  if (celsius === null) return '—';
  return unit === 'f' ? `${round((celsius * 9) / 5 + 32)}°F` : `${round(celsius)}°C`;
}

export function formatPressure(hpa: number | null, unit: UnitPreferences['pressure']): string {
  if (hpa === null) return '—';
  return unit === 'inhg' ? `${round(hpa * 0.02953, 2)} inHg` : `${round(hpa)} hPa`;
}
