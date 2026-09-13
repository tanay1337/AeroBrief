import type { CloudLayer, MetarObservation, MetarTrend, TafChange, TafForecast, TafPeriod } from '@/domain/models';
import {
  calculateFlightCategory,
  lowestCeilingFt,
  normalizeFlightCategory,
  parseVisibility,
  splitWeather
} from '@/domain/weather';

const API_ROOT = 'https://aviationweather.gov/api/data';
const REQUEST_TIMEOUT_MS = 12_000;

interface NoaaCloud {
  cover?: string | null;
  base?: number | null;
  type?: string | null;
}

interface NoaaMetar {
  icaoId?: string;
  obsTime?: number;
  reportTime?: string;
  temp?: number | null;
  dewp?: number | null;
  wdir?: number | string | null;
  wspd?: number | null;
  wgst?: number | null;
  visib?: number | string | null;
  altim?: number | null;
  metarType?: string;
  rawOb?: string;
  wxString?: string | null;
  clouds?: NoaaCloud[];
  vertVis?: number | null;
  fltCat?: string | null;
}

interface NoaaTafPeriod {
  timeFrom?: number;
  timeTo?: number;
  timeBec?: number | null;
  fcstChange?: string | null;
  probability?: number | null;
  wdir?: number | string | null;
  wspd?: number | null;
  wgst?: number | null;
  visib?: number | string | null;
  wxString?: string | null;
  clouds?: NoaaCloud[];
  vertVis?: number | null;
}

interface NoaaTaf {
  icaoId?: string;
  issueTime?: string;
  validTimeFrom?: number;
  validTimeTo?: number;
  rawTAF?: string;
  fcsts?: NoaaTafPeriod[];
}

export class WeatherApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'WeatherApiError';
  }
}

const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const directionOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value !== 'VRB') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const cloudsFromDto = (clouds: NoaaCloud[] | undefined): CloudLayer[] =>
  (clouds ?? [])
    .filter((cloud) => typeof cloud.cover === 'string')
    .map((cloud) => ({
      cover: cloud.cover as string,
      baseFt: numberOrNull(cloud.base),
      type: typeof cloud.type === 'string' ? cloud.type : null
    }));

const TREND_MARKERS = new Set(['TEMPO', 'BECMG', 'NOSIG']);
const WEATHER_TOKEN = /^[-+]?(?:VC)?(?:MI|PR|BC|DR|BL|SH|TS|FZ)?(?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)(?:(?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS))?$/;

const cloudFromToken = (token: string): CloudLayer | null => {
  const cloud = token.match(/^(FEW|SCT|BKN|OVC)(\d{3}|\/\/\/)(CB|TCU)?$/);
  if (cloud) {
    return {
      cover: cloud[1]!,
      baseFt: cloud[2] === '///' ? null : Number(cloud[2]) * 100,
      type: cloud[3] ?? null
    };
  }
  return /^(NSC|NCD|SKC|CLR)$/.test(token)
    ? { cover: token, baseFt: null, type: null }
    : null;
};

export function parseMetarTrends(raw: string): MetarTrend[] {
  const tokens = raw.trim().split(/\s+/);
  const trends: MetarTrend[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const marker = tokens[index];
    if (!marker || !TREND_MARKERS.has(marker)) continue;
    const group = [marker];
    let cursor = index + 1;
    while (cursor < tokens.length && !TREND_MARKERS.has(tokens[cursor]!) && tokens[cursor] !== 'RMK') {
      group.push(tokens[cursor]!);
      cursor += 1;
    }
    if (marker === 'NOSIG') {
      index = cursor - 1;
      if (tokens[cursor] === 'RMK') break;
      continue;
    }
    const windToken = group.find((token) => /^(?:VRB|\d{3})\d{2,3}(?:G\d{2,3})?KT$/.test(token));
    const wind = windToken?.match(/^(VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?KT$/);
    const clouds = group.map(cloudFromToken).filter((value): value is CloudLayer => value !== null);
    const verticalVisibility = group
      .map((token) => token.match(/^VV(\d{3})$/))
      .find((match) => Boolean(match));
    const visibilityToken = group.find((token) => token === 'CAVOK' || token === '9999' || /^\d{4}$/.test(token));
    const visibilityMeters = visibilityToken === 'CAVOK' || visibilityToken === '9999'
      ? 10_000
      : visibilityToken ? Number(visibilityToken) : null;
    trends.push({
      change: marker as MetarTrend['change'],
      raw: group.join(' '),
      windDirectionTrue: wind && wind[1] !== 'VRB' ? Number(wind[1]) : null,
      windSpeedKt: wind ? Number(wind[2]) : null,
      windGustKt: wind?.[3] ? Number(wind[3]) : null,
      visibilitySm: visibilityMeters === null ? null : visibilityMeters / 1609.344,
      visibilityIsTenKmOrMore: visibilityToken === 'CAVOK' || visibilityToken === '9999',
      weather: group.filter((token) => WEATHER_TOKEN.test(token)),
      clouds,
      verticalVisibilityFt: verticalVisibility?.[1] ? Number(verticalVisibility[1]) * 100 : null
    });
    index = cursor - 1;
    if (tokens[cursor] === 'RMK') break;
  }
  return trends;
}

export function mapMetar(dto: NoaaMetar): MetarObservation | null {
  if (!dto.icaoId || !dto.rawOb) return null;
  const clouds = cloudsFromDto(dto.clouds);
  const visibility = parseVisibility(dto.visib);
  const cavok = /(?:^|\s)CAVOK(?:\s|$)/.test(dto.rawOb);
  const visibilityIsTenKmOrMore = cavok || /(?:^|\s)9999(?:\s|$)/.test(dto.rawOb);
  const visibilitySm = visibilityIsTenKmOrMore
    ? Math.max(visibility.valueSm ?? 0, 10 / 1.60934)
    : visibility.valueSm;
  const verticalVisibility = numberOrNull(dto.vertVis);
  return {
    icao: dto.icaoId.toUpperCase(),
    raw: dto.rawOb,
    observedAt: numberOrNull(dto.obsTime) ?? Math.floor(Date.parse(dto.reportTime ?? '') / 1000),
    reportType: dto.metarType ?? 'METAR',
    temperatureC: numberOrNull(dto.temp),
    dewpointC: numberOrNull(dto.dewp),
    windDirectionTrue: directionOrNull(dto.wdir),
    windSpeedKt: numberOrNull(dto.wspd),
    windGustKt: numberOrNull(dto.wgst),
    visibilitySm,
    visibilityQualifier: visibilityIsTenKmOrMore ? 'MORE_THAN' : visibility.qualifier,
    visibilityIsTenKmOrMore,
    cavok,
    pressureHpa: numberOrNull(dto.altim),
    weather: splitWeather(dto.wxString),
    clouds,
    verticalVisibilityFt: verticalVisibility,
    category: normalizeFlightCategory(dto.fltCat)
      ?? calculateFlightCategory(visibilitySm, lowestCeilingFt(clouds, verticalVisibility)),
    trends: parseMetarTrends(dto.rawOb)
  };
}

function normalizeChange(value: string | null | undefined): TafChange {
  if (value === 'FM' || value === 'BECMG' || value === 'TEMPO' || value === 'PROB') return value;
  return 'BASE';
}

function mapTafPeriod(dto: NoaaTafPeriod, usesMetricTenKmCode: boolean): TafPeriod | null {
  const from = numberOrNull(dto.timeFrom);
  const to = numberOrNull(dto.timeTo);
  if (from === null || to === null) return null;
  const clouds = cloudsFromDto(dto.clouds);
  const visibility = parseVisibility(dto.visib);
  const visibilityIsTenKmOrMore = usesMetricTenKmCode
    && visibility.qualifier === 'MORE_THAN'
    && visibility.valueSm !== null
    && visibility.valueSm <= 6.1;
  const visibilitySm = visibilityIsTenKmOrMore ? 10 / 1.60934 : visibility.valueSm;
  const verticalVisibility = numberOrNull(dto.vertVis);
  return {
    from,
    to,
    becomingAt: numberOrNull(dto.timeBec),
    change: normalizeChange(dto.fcstChange),
    probability: numberOrNull(dto.probability),
    windDirectionTrue: directionOrNull(dto.wdir),
    windSpeedKt: numberOrNull(dto.wspd),
    windGustKt: numberOrNull(dto.wgst),
    visibilitySm,
    visibilityQualifier: visibilityIsTenKmOrMore ? 'MORE_THAN' : visibility.qualifier,
    visibilityIsTenKmOrMore,
    weather: splitWeather(dto.wxString),
    clouds,
    verticalVisibilityFt: verticalVisibility,
    category: calculateFlightCategory(
      visibilitySm,
      lowestCeilingFt(clouds, verticalVisibility)
    )
  };
}

export function mapTaf(dto: NoaaTaf): TafForecast | null {
  const validFrom = numberOrNull(dto.validTimeFrom);
  const validTo = numberOrNull(dto.validTimeTo);
  if (!dto.icaoId || !dto.rawTAF || validFrom === null || validTo === null) return null;
  const issuedAt = Math.floor(Date.parse(dto.issueTime ?? '') / 1000);
  const usesMetricTenKmCode = /(?:^|\s)(?:9999|CAVOK)(?:\s|$)/.test(dto.rawTAF)
    && !/(?:^|\s)(?:P?\d+(?:\/\d+)?SM)(?:\s|$)/.test(dto.rawTAF);
  return {
    icao: dto.icaoId.toUpperCase(),
    raw: dto.rawTAF,
    issuedAt: Number.isFinite(issuedAt) ? issuedAt : validFrom,
    validFrom,
    validTo,
    periods: (dto.fcsts ?? [])
      .map((period) => mapTafPeriod(period, usesMetricTenKmCode))
      .filter((period): period is TafPeriod => period !== null)
  };
}

async function fetchProduct<T>(product: 'metar' | 'taf', icaos: string[]): Promise<T[]> {
  if (icaos.length === 0) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const ids = encodeURIComponent(icaos.join(','));
    const response = await fetch(`${API_ROOT}/${product}?ids=${ids}&format=json`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AeroBrief/0.1 (mobile aviation weather viewer)'
      },
      signal: controller.signal
    });
    if (response.status === 204) return [];
    if (!response.ok) {
      throw new WeatherApiError(
        response.status === 429 ? 'Weather service rate limit reached' : 'Weather service unavailable',
        response.status
      );
    }
    const json: unknown = await response.json();
    if (!Array.isArray(json)) throw new WeatherApiError('Unexpected weather response');
    return json as T[];
  } catch (error) {
    if (error instanceof WeatherApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new WeatherApiError('Weather request timed out');
    }
    throw new WeatherApiError('Unable to reach the weather service');
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchMetars(icaos: string[]): Promise<MetarObservation[]> {
  const dtos = await fetchProduct<NoaaMetar>('metar', icaos);
  return dtos.map(mapMetar).filter((value): value is MetarObservation => value !== null);
}

export async function fetchTafs(icaos: string[]): Promise<TafForecast[]> {
  const dtos = await fetchProduct<NoaaTaf>('taf', icaos);
  return dtos.map(mapTaf).filter((value): value is TafForecast => value !== null);
}
