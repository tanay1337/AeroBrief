import { inflateRaw } from 'pako';
import { flightFingerprint, minutesBetweenTimes, parseDuration, type LogbookFlightInput, type PilotRole } from '@/domain/logbook';

export const LOGBOOK_EXPORT_HEADERS = [
  'Date', 'ACFT Type', 'Callsign', 'Crew', 'from', 'to', 'Departure', 'Landing', 'BlockOff',
  'BlockOn', 'Landings', 'Airtime', 'Flight Time', 'Price Cat.', 'Remarks', 'Track', 'capzlog.aero', 'CloudLog'
] as const;

export interface ParsedLogbookFile {
  fileName: string;
  flights: LogbookFlightInput[];
  missingHeaders: string[];
}

type SpreadsheetCell = string | number | boolean | Date | null | undefined;

function decodeUtf8(data: Uint8Array): string {
  let result = '';
  for (let index = 0; index < data.length; index += 1) {
    const first = data[index]!;
    if (first < 0x80) {
      result += String.fromCharCode(first);
      continue;
    }
    let codePoint = 0xfffd;
    if ((first & 0xe0) === 0xc0 && index + 1 < data.length) {
      codePoint = (first & 0x1f) << 6 | data[++index]! & 0x3f;
    } else if ((first & 0xf0) === 0xe0 && index + 2 < data.length) {
      codePoint = (first & 0x0f) << 12 | (data[++index]! & 0x3f) << 6 | data[++index]! & 0x3f;
    } else if ((first & 0xf8) === 0xf0 && index + 3 < data.length) {
      codePoint = (first & 0x07) << 18 | (data[++index]! & 0x3f) << 12 | (data[++index]! & 0x3f) << 6 | data[++index]! & 0x3f;
    }
    result += String.fromCodePoint(codePoint);
  }
  return result;
}

function uint16(data: Uint8Array, offset: number): number {
  return data[offset]! | (data[offset + 1]! << 8);
}

function uint32(data: Uint8Array, offset: number): number {
  return (data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16) | (data[offset + 3]! << 24)) >>> 0;
}

function unzipEntries(data: Uint8Array): Map<string, Uint8Array> {
  let end = data.length - 22;
  const minimum = Math.max(0, data.length - 65_557);
  while (end >= minimum && uint32(data, end) !== 0x06054b50) end -= 1;
  if (end < minimum) throw new Error('The XLSX file is incomplete or not a valid workbook.');
  const count = uint16(data, end + 10);
  let cursor = uint32(data, end + 16);
  const entries = new Map<string, Uint8Array>();
  if (count > 5_000) throw new Error('The workbook contains too many files to import safely.');
  for (let index = 0; index < count; index += 1) {
    if (uint32(data, cursor) !== 0x02014b50) throw new Error('The XLSX directory is damaged.');
    const method = uint16(data, cursor + 10);
    const compressedSize = uint32(data, cursor + 20);
    const uncompressedSize = uint32(data, cursor + 24);
    const nameLength = uint16(data, cursor + 28);
    const extraLength = uint16(data, cursor + 30);
    const commentLength = uint16(data, cursor + 32);
    const localOffset = uint32(data, cursor + 42);
    const name = decodeUtf8(data.slice(cursor + 46, cursor + 46 + nameLength));
    if (uncompressedSize > 30_000_000) throw new Error('A workbook file is too large to import safely.');
    if (uint32(data, localOffset) !== 0x04034b50) throw new Error('The XLSX file data is damaged.');
    const localNameLength = uint16(data, localOffset + 26);
    const localExtraLength = uint16(data, localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = data.slice(start, start + compressedSize);
    if (method === 0) entries.set(name, compressed);
    else if (method === 8) entries.set(name, inflateRaw(compressed));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function xmlText(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function attribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return match ? xmlText(match[1] ?? '') : '';
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? '';
  return [...letters].reduce((result, letter) => result * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function formattedNumber(value: number, formatCode: string): SpreadsheetCell {
  const clean = formatCode.toLowerCase().replace(/"[^"]*"/g, '').replace(/\\./g, '');
  if (/\[h\]/.test(clean)) {
    const minutes = Math.round(value * 24 * 60);
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
  }
  if (/[yd]/.test(clean)) {
    const date = new Date(Math.round((value - 25_569) * 86_400_000));
    return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
  }
  if (/[hs]/.test(clean)) {
    const minutes = Math.round((value - Math.floor(value)) * 24 * 60) % (24 * 60);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  return value;
}

function workbookStyles(entries: Map<string, Uint8Array>): string[] {
  const bytes = entries.get('xl/styles.xml');
  if (!bytes) return [];
  const xml = decodeUtf8(bytes);
  const custom = new Map<number, string>();
  for (const match of xml.matchAll(/<numFmt\b([^>]*)\/?\s*>/g)) {
    custom.set(Number(attribute(match[1] ?? '', 'numFmtId')), attribute(match[1] ?? '', 'formatCode'));
  }
  const cellXfs = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? '';
  return [...cellXfs.matchAll(/<xf\b([^>]*)\/?\s*>/g)].map((match) => {
    const id = Number(attribute(match[1] ?? '', 'numFmtId'));
    if (custom.has(id)) return custom.get(id)!;
    if (id >= 14 && id <= 17) return 'yyyy-mm-dd';
    if ((id >= 18 && id <= 21) || (id >= 45 && id <= 47)) return 'hh:mm';
    if (id === 22) return 'yyyy-mm-dd hh:mm';
    return '';
  });
}

function sharedStrings(entries: Map<string, Uint8Array>): string[] {
  const bytes = entries.get('xl/sharedStrings.xml');
  if (!bytes) return [];
  const xml = decodeUtf8(bytes);
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) => {
    const texts = [...(match[1] ?? '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)];
    return texts.map((text) => xmlText(text[1] ?? '')).join('');
  });
}

function worksheetMatrix(xml: string, shared: string[], styles: string[]): SpreadsheetCell[][] {
  const rows: SpreadsheetCell[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: SpreadsheetCell[] = [];
    for (const cellMatch of (rowMatch[1] ?? '').matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1] ?? '';
      const body = cellMatch[2] ?? '';
      const index = columnIndex(attribute(attributes, 'r'));
      if (index < 0) continue;
      const type = attribute(attributes, 't');
      const inline = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((match) => xmlText(match[1] ?? '')).join('');
      const raw = xmlText(body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? '');
      if (type === 'inlineStr') row[index] = inline;
      else if (type === 's') row[index] = shared[Number(raw)] ?? '';
      else if (type === 'str') row[index] = raw;
      else if (type === 'b') row[index] = raw === '1';
      else {
        const number = Number(raw);
        const style = styles[Number(attribute(attributes, 's'))] ?? '';
        row[index] = raw !== '' && Number.isFinite(number) ? formattedNumber(number, style) : raw;
      }
    }
    if (row.some((cell) => stringValue(cell) !== '')) rows.push(row);
  }
  return rows;
}

function parseXlsx(data: Uint8Array): SpreadsheetCell[][][] {
  const entries = unzipEntries(data);
  const shared = sharedStrings(entries);
  const styles = workbookStyles(entries);
  const sheets = [...entries.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  if (sheets.length === 0) throw new Error('The selected file does not contain a worksheet.');
  return sheets.map((name) => worksheetMatrix(decodeUtf8(entries.get(name)!), shared, styles));
}

function parseDelimited(text: string, delimiter: string): SpreadsheetCell[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted && character === '"' && text[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') quoted = !quoted;
    else if (!quoted && character === delimiter) {
      row.push(cell);
      cell = '';
    } else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return rows;
}

function parseCsv(data: Uint8Array): SpreadsheetCell[][] {
  const text = decodeUtf8(data).replace(/^\uFEFF/, '');
  return [',', ';', '\t']
    .map((delimiter) => parseDelimited(text, delimiter))
    .sort((left, right) => Math.max(...right.map((row) => row.length), 0) - Math.max(...left.map((row) => row.length), 0))[0] ?? [];
}

const stringValue = (value: unknown): string => String(value ?? '').trim();

function isoDate(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const raw = stringValue(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const german = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (german) {
    const year = Number(german[3]) < 100 ? 2000 + Number(german[3]) : Number(german[3]);
    return `${year}-${String(Number(german[2])).padStart(2, '0')}-${String(Number(german[1])).padStart(2, '0')}`;
  }
  const named = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+'?(\d{2,4})$/);
  if (named) {
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const yearNumber = Number(named[3] ?? '');
    const month = monthNames.indexOf((named[2] ?? '').slice(0, 3).toLowerCase());
    const year = yearNumber < 100 ? 2000 + yearNumber : yearNumber;
    if (month >= 0) return `${year}-${String(month + 1).padStart(2, '0')}-${String(Number(named[1] ?? '')).padStart(2, '0')}`;
  }
  const parsed = new Date(raw.replace(/'(\d{2})$/, '20$1'));
  return Number.isNaN(parsed.getTime()) ? '' : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function normalTime(value: unknown): string {
  const raw = stringValue(value);
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  return match ? `${String(Number(match[1])).padStart(2, '0')}:${match[2]}` : '';
}

function numericValue(value: unknown): number {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function headerLookup(row: Record<string, unknown>, header: string): unknown {
  const key = Object.keys(row).find((candidate) => candidate.trim().toLowerCase() === header.toLowerCase());
  return key ? row[key] : '';
}

function rowsFromFirstRecognizedHeader(matrix: SpreadsheetCell[][]): { rows: Record<string, unknown>[]; headers: string[]; firstDataRow: number } {
  const normalizedRequired = LOGBOOK_EXPORT_HEADERS.map((header) => header.toLowerCase());
  let bestIndex = -1;
  let bestScore = 0;
  matrix.slice(0, 25).forEach((row, index) => {
    const normalized = row.map((cell) => stringValue(cell).toLowerCase());
    const score = normalizedRequired.filter((header) => normalized.includes(header)).length;
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });
  if (bestIndex < 0 || bestScore < 4) {
    throw new Error('No supported logbook headers were found. Select the original XLSX or CSV file, not a preview or shortcut.');
  }
  const headers = matrix[bestIndex]!.map(stringValue);
  const rows = matrix.slice(bestIndex + 1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
  return { rows, headers, firstDataRow: bestIndex + 2 };
}

function importedOrCalculatedDuration(value: unknown, start: string, end: string): number {
  const imported = parseDuration(stringValue(value));
  return imported || minutesBetweenTimes(start, end) || 0;
}

export function parseLogbookFile(data: ArrayBuffer | Uint8Array, fileName: string, role: PilotRole = 'DUAL', landingKind: 'DAY' | 'NIGHT' | 'REVIEW' = 'DAY'): ParsedLogbookFile {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length === 0) throw new Error('The selected file is empty.');
  if (bytes.length > 25_000_000) throw new Error('The selected file is too large to import safely.');
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const matrices = isZip ? parseXlsx(bytes) : [parseCsv(bytes)];
  let selected: ReturnType<typeof rowsFromFirstRecognizedHeader> | null = null;
  for (const matrix of matrices) {
    try {
      selected = rowsFromFirstRecognizedHeader(matrix);
      break;
    } catch {
      // Some exports include cover or summary sheets before the actual flight table.
    }
  }
  if (!selected) throw new Error('No supported logbook headers were found. Select the original XLSX or CSV file, not a preview or shortcut.');
  const { rows, headers, firstDataRow } = selected;
  const actualHeaders = headers.map((value) => value.trim().toLowerCase());
  const missingHeaders = LOGBOOK_EXPORT_HEADERS.filter((header) => !actualHeaders.includes(header.toLowerCase()));
  if (rows.length === 0) return { fileName, flights: [], missingHeaders };

  const flights = rows.map((row, index): LogbookFlightInput => {
    const departureTime = normalTime(headerLookup(row, 'Departure'));
    const landingTime = normalTime(headerLookup(row, 'Landing'));
    const blockOffTime = normalTime(headerLookup(row, 'BlockOff'));
    const blockOnTime = normalTime(headerLookup(row, 'BlockOn'));
    const flightTimeMinutes = importedOrCalculatedDuration(headerLookup(row, 'Flight Time'), blockOffTime, blockOnTime);
    const airtimeMinutes = importedOrCalculatedDuration(headerLookup(row, 'Airtime'), departureTime, landingTime);
    const landingsTotal = Math.max(0, Math.round(numericValue(headerLookup(row, 'Landings'))));
    const importedRole = stringValue(headerLookup(row, 'Pilot Role')).toUpperCase();
    const effectiveRole = (['PIC', 'SOLO', 'DUAL', 'INSTRUCTOR', 'UNASSIGNED'] as PilotRole[]).includes(importedRole as PilotRole)
      ? importedRole as PilotRole
      : role;
    const hasDetailedLandings = Object.keys(row).some((header) => header.trim().toLowerCase() === 'day landings');
    const dayLandings = hasDetailedLandings ? Math.max(0, Math.round(numericValue(headerLookup(row, 'Day Landings')))) : landingKind === 'DAY' ? landingsTotal : landingKind === 'NIGHT' ? 0 : null;
    const nightLandings = hasDetailedLandings ? Math.max(0, Math.round(numericValue(headerLookup(row, 'Night Landings')))) : landingKind === 'NIGHT' ? landingsTotal : landingKind === 'DAY' ? 0 : null;
    const base: LogbookFlightInput = {
      date: isoDate(headerLookup(row, 'Date')),
      aircraftType: stringValue(headerLookup(row, 'ACFT Type')),
      callsign: stringValue(headerLookup(row, 'Callsign')).toUpperCase(),
      crew: stringValue(headerLookup(row, 'Crew')),
      picName: stringValue(headerLookup(row, 'PIC Name')),
      pilotRole: effectiveRole,
      departureAirport: stringValue(headerLookup(row, 'from')).toUpperCase(),
      arrivalAirport: stringValue(headerLookup(row, 'to')).toUpperCase(),
      departureTime,
      landingTime,
      blockOffTime,
      blockOnTime,
      landingsTotal,
      landingsDay: dayLandings,
      landingsNight: nightLandings,
      airtimeMinutes,
      flightTimeMinutes,
      picMinutes: stringValue(headerLookup(row, 'PIC Time')) ? parseDuration(stringValue(headerLookup(row, 'PIC Time'))) : effectiveRole === 'PIC' || effectiveRole === 'SOLO' || effectiveRole === 'INSTRUCTOR' ? flightTimeMinutes : 0,
      dualMinutes: stringValue(headerLookup(row, 'Dual Time')) ? parseDuration(stringValue(headerLookup(row, 'Dual Time'))) : effectiveRole === 'DUAL' ? flightTimeMinutes : 0,
      instructorMinutes: stringValue(headerLookup(row, 'Instructor Time')) ? parseDuration(stringValue(headerLookup(row, 'Instructor Time'))) : effectiveRole === 'INSTRUCTOR' ? flightTimeMinutes : 0,
      nightMinutes: parseDuration(stringValue(headerLookup(row, 'Night Time'))),
      ifrMinutes: parseDuration(stringValue(headerLookup(row, 'IFR Time'))),
      priceCategory: stringValue(headerLookup(row, 'Price Cat.')),
      remarks: stringValue(headerLookup(row, 'Remarks')),
      track: stringValue(headerLookup(row, 'Track')),
      capzlog: stringValue(headerLookup(row, 'capzlog.aero')),
      cloudlog: stringValue(headerLookup(row, 'CloudLog')),
      source: fileName,
      sourceRow: firstDataRow + index,
      sourceFingerprint: '',
      needsReview: stringValue(headerLookup(row, 'Needs Review'))
        ? stringValue(headerLookup(row, 'Needs Review')).toLowerCase() === 'true'
        : landingKind === 'REVIEW' || effectiveRole === 'UNASSIGNED'
    };
    return { ...base, sourceFingerprint: flightFingerprint(base) };
  }).filter((flight) => flight.date && flight.callsign && flight.departureAirport && flight.arrivalAirport);
  return { fileName, flights, missingHeaders };
}

const csvCell = (value: string | number | null): string => {
  const raw = value === null ? '' : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
};

export function logbookToCsv(flights: LogbookFlightInput[]): string {
  const headers = [...LOGBOOK_EXPORT_HEADERS, 'PIC Name', 'Pilot Role', 'PIC Time', 'Dual Time', 'Instructor Time', 'Night Time', 'IFR Time', 'Day Landings', 'Night Landings', 'Needs Review'];
  const rows = flights.map((flight) => [
    flight.date, flight.aircraftType, flight.callsign, flight.crew, flight.departureAirport, flight.arrivalAirport,
    flight.departureTime, flight.landingTime, flight.blockOffTime, flight.blockOnTime, flight.landingsTotal,
    formatDuration(flight.airtimeMinutes), formatDuration(flight.flightTimeMinutes), flight.priceCategory,
    flight.remarks, flight.track, flight.capzlog, flight.cloudlog, flight.picName, flight.pilotRole, formatDuration(flight.picMinutes),
    formatDuration(flight.dualMinutes), formatDuration(flight.instructorMinutes), formatDuration(flight.nightMinutes),
    formatDuration(flight.ifrMinutes), flight.landingsDay, flight.landingsNight, String(flight.needsReview)
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

const formatDuration = (minutes: number): string => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
