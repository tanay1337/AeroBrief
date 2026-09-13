const FAA_NOTAM_SEARCH_URL = 'https://notams.aim.faa.gov/notamSearch/search';
const REQUEST_TIMEOUT_MS = 18_000;

interface FaaNotamDto {
  facilityDesignator?: unknown;
  notamNumber?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  icaoMessage?: unknown;
  traditionalMessageFrom4thWord?: unknown;
  status?: unknown;
}

interface FaaNotamResponse {
  totalNotamCount?: unknown;
  notamList?: unknown;
}

export interface InformationalNotam {
  id: string;
  airport: string;
  number: string;
  starts: string;
  ends: string;
  summary: string;
  raw: string;
}

export interface InformationalNotamResult {
  total: number;
  notices: InformationalNotam[];
}

const stringValue = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

export function mapFaaNotamResponse(value: unknown): InformationalNotamResult {
  const response = (value && typeof value === 'object' ? value : {}) as FaaNotamResponse;
  const source = Array.isArray(response.notamList) ? response.notamList : [];
  const notices = source.map((item, index): InformationalNotam | null => {
    const dto = (item && typeof item === 'object' ? item : {}) as FaaNotamDto;
    if (stringValue(dto.status).toLowerCase() === 'cancelled') return null;
    const raw = stringValue(dto.icaoMessage);
    if (!raw) return null;
    const number = stringValue(dto.notamNumber) || `Notice ${index + 1}`;
    const airport = stringValue(dto.facilityDesignator);
    return {
      id: `${airport}-${number}-${stringValue(dto.startDate)}`,
      airport,
      number,
      starts: stringValue(dto.startDate),
      ends: stringValue(dto.endDate),
      summary: stringValue(dto.traditionalMessageFrom4thWord) || raw.split('\n').slice(-1)[0]?.trim() || raw,
      raw
    };
  }).filter((notice): notice is InformationalNotam => notice !== null);
  const total = typeof response.totalNotamCount === 'number' && Number.isFinite(response.totalNotamCount)
    ? response.totalNotamCount
    : notices.length;
  return { total, notices };
}

export async function fetchInformationalNotams(icao: string): Promise<InformationalNotamResult> {
  const code = icao.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(code)) return { total: 0, notices: [] };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(FAA_NOTAM_SEARCH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `searchType=0&designatorsForLocation=${encodeURIComponent(code)}&offset=0&notamsOnly=false`,
      signal: controller.signal
    });
    if (!response.ok) throw new Error('Informational NOTAM service unavailable');
    return mapFaaNotamResponse(await response.json());
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Informational NOTAM request timed out');
    throw error instanceof Error ? error : new Error('Unable to retrieve informational NOTAMs');
  } finally {
    clearTimeout(timeout);
  }
}
