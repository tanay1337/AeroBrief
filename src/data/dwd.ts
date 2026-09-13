const DWD_WFS_ROOT = 'https://maps.dwd.de/geoserver/dwd/ows';
const REQUEST_TIMEOUT_MS = 12_000;

interface DwdFeature {
  id?: string;
  properties?: Record<string, unknown>;
}

interface DwdFeatureCollection {
  features?: DwdFeature[];
}

export interface DwdWarning {
  id: string;
  regionName: string;
  event: string;
  headline: string;
  description: string;
  instruction: string | null;
  onset: string | null;
  expires: string | null;
  severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
  web: string | null;
}

const stringOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const severity = (value: unknown): DwdWarning['severity'] => {
  if (value === 'Extreme' || value === 'Severe' || value === 'Moderate' || value === 'Minor') return value;
  return 'Unknown';
};

const EVENT_TRANSLATIONS: [RegExp, string][] = [
  [/ORKANB[ÖO]EN|EXTREM.*STURM/, 'Hurricane-force wind gusts'],
  [/STURMB[ÖO]EN/, 'Severe wind gusts'],
  [/WINDB[ÖO]EN|STARKER WIND/, 'Wind gusts'],
  [/SCHWER.*GEWITTER/, 'Severe thunderstorms'],
  [/GEWITTER/, 'Thunderstorms'],
  [/EXTREM.*STARKREGEN/, 'Extreme heavy rain'],
  [/STARKREGEN/, 'Heavy rain'],
  [/DAUERREGEN/, 'Persistent rain'],
  [/SCHNEEFALL|SCHNEEVERWEHUNG/, 'Snowfall'],
  [/GL[ÄA]TTE|GLATTEIS/, 'Icy conditions'],
  [/FROST/, 'Frost'],
  [/NEBEL/, 'Fog'],
  [/HITZE/, 'Heat'],
  [/UV/, 'High UV intensity'],
  [/TAUWETTER/, 'Thaw conditions']
];

export function englishWarningEvent(value: string): string {
  const normalized = value.trim().toUpperCase();
  return EVENT_TRANSLATIONS.find(([pattern]) => pattern.test(normalized))?.[1] ?? 'Hazardous weather';
}

function englishWarningDescription(event: string, sourceDescription: string | null): string {
  const speed = sourceDescription?.match(/bis\s+(\d+)\s*km\/h/i)?.[1];
  const speedDetail = speed ? ` Gusts up to ${speed} km/h are stated in the official warning.` : '';
  return `An official DWD ${englishWarningEvent(event).toLowerCase()} warning is active for this area.${speedDetail} Open the official DWD warning for complete details and instructions.`;
}

export function mapDwdWarnings(payload: unknown): DwdWarning[] {
  if (!payload || typeof payload !== 'object') return [];
  const features = (payload as DwdFeatureCollection).features;
  if (!Array.isArray(features)) return [];
  return features.flatMap((feature, index) => {
    const properties = feature.properties;
    if (!properties || properties.STATUS === 'Cancel') return [];
    const event = stringOrNull(properties.EVENT);
    const headline = stringOrNull(properties.HEADLINE);
    if (!event && !headline) return [];
    return [{
      id: feature.id ?? String(properties.IDENTIFIER ?? index),
      regionName: stringOrNull(properties.NAME) ?? stringOrNull(properties.AREADESC) ?? 'Airport area',
      event: englishWarningEvent(event ?? headline ?? ''),
      headline: `${severity(properties.SEVERITY)} DWD warning: ${englishWarningEvent(event ?? headline ?? '')}`,
      description: englishWarningDescription(event ?? headline ?? '', stringOrNull(properties.DESCRIPTION)),
      instruction: null,
      onset: stringOrNull(properties.ONSET),
      expires: stringOrNull(properties.EXPIRES),
      severity: severity(properties.SEVERITY),
      web: stringOrNull(properties.WEB)
    }];
  });
}

export async function fetchDwdWarnings(latitude: number, longitude: number): Promise<DwdWarning[]> {
  const delta = 0.002;
  const params = new URLSearchParams({
    version: '2.0.0',
    SERVICE: 'WFS',
    REQUEST: 'GetFeature',
    typeName: 'dwd:Warnungen_Gemeinden',
    LAYERS: 'dwd:Warnungen_Gemeinden',
    outputFormat: 'application/json',
    srsName: 'CRS:84',
    BBOX: `${longitude - delta},${latitude - delta},${longitude + delta},${latitude + delta},CRS:84`,
    propertyName: 'NAME,AREADESC,IDENTIFIER,STATUS,EVENT,HEADLINE,DESCRIPTION,INSTRUCTION,ONSET,EXPIRES,SEVERITY,WEB'
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${DWD_WFS_ROOT}?${params}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`DWD warning service returned ${response.status}`);
    return mapDwdWarnings(await response.json());
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('DWD warning request timed out');
    throw error instanceof Error ? error : new Error('DWD warnings are unavailable');
  } finally {
    clearTimeout(timeout);
  }
}
