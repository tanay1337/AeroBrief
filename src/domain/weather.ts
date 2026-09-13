import type {
  CloudLayer,
  FlightCategory,
  RunwayWindComponent,
  TafForecast,
  TafHour,
  TafPeriod
} from './models';

const CEILING_COVERS = new Set(['BKN', 'OVC', 'VV']);

export function lowestCeilingFt(
  clouds: CloudLayer[],
  verticalVisibilityFt: number | null = null
): number | null {
  const bases = clouds
    .filter((cloud) => CEILING_COVERS.has(cloud.cover) && cloud.baseFt !== null)
    .map((cloud) => cloud.baseFt as number);
  if (verticalVisibilityFt !== null) bases.push(verticalVisibilityFt);
  return bases.length > 0 ? Math.min(...bases) : null;
}

export function calculateFlightCategory(
  visibilitySm: number | null,
  ceilingFt: number | null
): FlightCategory {
  if (visibilitySm === null && ceilingFt === null) return 'UNKNOWN';
  if ((visibilitySm !== null && visibilitySm < 1) || (ceilingFt !== null && ceilingFt < 500)) {
    return 'LIFR';
  }
  if ((visibilitySm !== null && visibilitySm < 3) || (ceilingFt !== null && ceilingFt < 1000)) {
    return 'IFR';
  }
  if ((visibilitySm !== null && visibilitySm <= 5) || (ceilingFt !== null && ceilingFt <= 3000)) {
    return 'MVFR';
  }
  return 'VFR';
}

export function normalizeFlightCategory(value: unknown): FlightCategory | null {
  return value === 'VFR' || value === 'MVFR' || value === 'IFR' || value === 'LIFR'
    ? value
    : null;
}

export function parseVisibility(value: unknown): {
  valueSm: number | null;
  qualifier: 'LESS_THAN' | 'MORE_THAN' | null;
} {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { valueSm: value, qualifier: null };
  }
  if (typeof value !== 'string') return { valueSm: null, qualifier: null };
  const trimmed = value.trim();
  const match = trimmed.match(/^([MP]?)(\d+(?:\.\d+)?)(\+?)$/i);
  if (!match) return { valueSm: null, qualifier: null };
  const numeric = Number(match[2]);
  if (!Number.isFinite(numeric)) return { valueSm: null, qualifier: null };
  const qualifier = match[1]?.toUpperCase() === 'M'
    ? 'LESS_THAN'
    : match[1]?.toUpperCase() === 'P' || match[3] === '+'
      ? 'MORE_THAN'
      : null;
  return { valueSm: numeric, qualifier };
}

export function splitWeather(value: unknown): string[] {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().split(/\s+/)
    : [];
}

export function buildTafTimeline(forecast: TafForecast): TafHour[] {
  const firstHour = Math.floor(forecast.validFrom / 3600) * 3600;
  const hours: TafHour[] = [];
  for (let at = firstHour; at < forecast.validTo; at += 3600) {
    const sampleAt = Math.max(at, forecast.validFrom);
    const active = forecast.periods.filter((period) => period.from <= sampleAt && period.to > sampleAt);
    const prevailing = active
      .filter((period) => period.change === 'BASE' || period.change === 'FM' || period.change === 'BECMG')
      .sort((a, b) => b.from - a.from)[0] ?? null;
    const overlays = active.filter((period) => period !== prevailing);
    hours.push({ at, prevailing, overlays });
  }
  return hours;
}

/** Keep the current UTC hour, but omit complete forecast hours that have elapsed. */
export function upcomingTafHours(hours: TafHour[], nowMs: number = Date.now()): TafHour[] {
  const currentHour = Math.floor(nowMs / 3_600_000) * 3600;
  return hours.filter((hour) => hour.at >= currentHour);
}

const CATEGORY_RISK: Record<FlightCategory, number> = {
  UNKNOWN: 0,
  VFR: 1,
  MVFR: 2,
  IFR: 3,
  LIFR: 4
};

export function mergeTafPeriod(prevailing: TafPeriod, overlay: TafPeriod): TafPeriod {
  const visibilityFromOverlay = overlay.visibilitySm !== null;
  const clouds = overlay.clouds.length > 0 ? overlay.clouds : prevailing.clouds;
  const verticalVisibilityFt = overlay.verticalVisibilityFt ?? prevailing.verticalVisibilityFt;
  const visibilitySm = overlay.visibilitySm ?? prevailing.visibilitySm;
  return {
    ...prevailing,
    from: overlay.from,
    to: overlay.to,
    becomingAt: overlay.becomingAt,
    change: overlay.change,
    probability: overlay.probability,
    windDirectionTrue: overlay.windSpeedKt !== null ? overlay.windDirectionTrue : prevailing.windDirectionTrue,
    windSpeedKt: overlay.windSpeedKt ?? prevailing.windSpeedKt,
    windGustKt: overlay.windSpeedKt !== null ? overlay.windGustKt : prevailing.windGustKt,
    visibilitySm,
    visibilityQualifier: visibilityFromOverlay ? overlay.visibilityQualifier : prevailing.visibilityQualifier,
    visibilityIsTenKmOrMore: visibilityFromOverlay ? overlay.visibilityIsTenKmOrMore : prevailing.visibilityIsTenKmOrMore,
    weather: overlay.weather.length > 0 ? overlay.weather : prevailing.weather,
    clouds,
    verticalVisibilityFt,
    category: calculateFlightCategory(visibilitySm, lowestCeilingFt(clouds, verticalVisibilityFt))
  };
}

function operationalRisk(period: TafPeriod): number {
  const ceiling = lowestCeilingFt(period.clouds, period.verticalVisibilityFt);
  const visibilityPenalty = period.visibilitySm === null ? 0 : Math.max(0, 10 - period.visibilitySm);
  const ceilingPenalty = ceiling === null ? 0 : Math.max(0, 5000 - ceiling) / 1000;
  const weatherPenalty = period.weather.length > 0 ? 2 : 0;
  const windPenalty = (period.windGustKt ?? period.windSpeedKt ?? 0) / 100;
  return CATEGORY_RISK[period.category] * 100 + visibilityPenalty + ceilingPenalty + weatherPenalty + windPenalty;
}

/** Conditions to surface for an hour: prevailing values with the most limiting active overlay applied. */
export function displayedTafPeriod(hour: TafHour): TafPeriod | null {
  if (!hour.prevailing) {
    return [...hour.overlays].sort((a, b) => operationalRisk(b) - operationalRisk(a))[0] ?? null;
  }
  const candidates = hour.overlays.map((overlay) => mergeTafPeriod(hour.prevailing!, overlay));
  return candidates.sort((a, b) => operationalRisk(b) - operationalRisk(a))[0] ?? hour.prevailing;
}

/** TAFs encode 30/40 percent explicitly; TEMPO without PROB is conventionally above that threshold. */
export function tafProbabilityLabel(hour: TafHour): string {
  const explicit = hour.overlays
    .map((overlay) => overlay.probability)
    .filter((value): value is number => value !== null);
  if (explicit.length > 0) return `${Math.max(...explicit)}%`;
  return hour.overlays.some((overlay) => overlay.change === 'TEMPO') ? '>40%' : '—';
}

export function calculateRunwayWind(
  runwayIdent: string,
  headingTrue: number,
  windDirectionTrue: number | null,
  windSpeedKt: number | null,
  windGustKt: number | null
): RunwayWindComponent | null {
  if (windDirectionTrue === null || windSpeedKt === null) return null;
  const angleRadians = ((windDirectionTrue - headingTrue) * Math.PI) / 180;
  const components = (speed: number) => ({
    crosswind: Math.abs(speed * Math.sin(angleRadians)),
    headwind: speed * Math.cos(angleRadians)
  });
  const sustained = components(windSpeedKt);
  const gust = windGustKt === null ? null : components(windGustKt);
  return {
    runwayIdent,
    headingTrue,
    crosswindKt: sustained.crosswind,
    headwindKt: sustained.headwind,
    gustCrosswindKt: gust?.crosswind ?? null,
    gustHeadwindKt: gust?.headwind ?? null
  };
}

export function periodSummary(period: TafPeriod | null): string {
  if (!period) return 'No forecast';
  const parts: string[] = [];
  if (period.windSpeedKt !== null) {
    const direction = period.windDirectionTrue === null
      ? 'VRB'
      : String(Math.round(period.windDirectionTrue)).padStart(3, '0') + '°';
    parts.push(`${direction} ${Math.round(period.windSpeedKt)} kt`);
  }
  if (period.visibilitySm !== null) parts.push(`${period.visibilitySm}+ sm`);
  const ceiling = lowestCeilingFt(period.clouds, period.verticalVisibilityFt);
  if (ceiling !== null) parts.push(`ceiling ${Math.round(ceiling)} ft`);
  if (period.weather.length > 0) parts.push(period.weather.join(' '));
  return parts.length > 0 ? parts.join(' · ') : 'No significant weather';
}
