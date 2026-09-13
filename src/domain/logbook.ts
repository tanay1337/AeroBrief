export type PilotRole = 'PIC' | 'SOLO' | 'DUAL' | 'INSTRUCTOR' | 'UNASSIGNED';
export type LogbookStatus = 'DRAFT' | 'COMPLETE';
export type LogbookAttachmentCategory = 'GENERAL' | 'APPROACH_PLATE' | 'AERODROME_LAYOUT' | 'NOTAM_BRIEFING';

export interface LogbookFlight {
  id: string;
  date: string;
  aircraftType: string;
  callsign: string;
  crew: string;
  picName: string;
  pilotRole: PilotRole;
  departureAirport: string;
  arrivalAirport: string;
  departureTime: string;
  landingTime: string;
  blockOffTime: string;
  blockOnTime: string;
  landingsTotal: number;
  landingsDay: number | null;
  landingsNight: number | null;
  airtimeMinutes: number;
  flightTimeMinutes: number;
  picMinutes: number;
  dualMinutes: number;
  instructorMinutes: number;
  nightMinutes: number;
  ifrMinutes: number;
  priceCategory: string;
  remarks: string;
  track: string;
  capzlog: string;
  cloudlog: string;
  source: string;
  sourceRow: number | null;
  sourceFingerprint: string;
  needsReview: boolean;
  status: LogbookStatus;
  createdAt: number;
  updatedAt: number;
}

export type LogbookFlightInput = Omit<LogbookFlight, 'id' | 'status' | 'createdAt' | 'updatedAt'> & { id?: string; status?: LogbookStatus };

export interface LogbookAttachment {
  id: string;
  flightId: string;
  name: string;
  mimeType: string;
  uri: string;
  sizeBytes: number;
  category: LogbookAttachmentCategory;
  createdAt: number;
}

export interface PendingLogbookAttachment {
  name: string;
  mimeType: string;
  uri: string;
  sizeBytes: number;
  category?: LogbookAttachmentCategory;
}

export const PREFLIGHT_ATTACHMENT_CATEGORIES: readonly {
  category: Exclude<LogbookAttachmentCategory, 'GENERAL'>;
  label: string;
  singular: string;
}[] = [
  { category: 'APPROACH_PLATE', label: 'Approach plates', singular: 'approach plate' },
  { category: 'AERODROME_LAYOUT', label: 'Aerodrome layout', singular: 'aerodrome layout' },
  { category: 'NOTAM_BRIEFING', label: 'NOTAM briefing', singular: 'NOTAM briefing' }
];

export function normalizeLogbookAttachmentCategory(value: unknown): LogbookAttachmentCategory {
  return value === 'APPROACH_PLATE' || value === 'AERODROME_LAYOUT' || value === 'NOTAM_BRIEFING'
    ? value
    : 'GENERAL';
}

export interface ImportResult {
  inserted: number;
  duplicates: number;
  updated?: number;
}

export interface LogbookFieldChange {
  field: keyof LogbookFlightInput;
  label: string;
  before: string;
  after: string;
}

export interface LogbookChange {
  id: string;
  flightId: string;
  changedAt: number;
  source: 'MANUAL' | 'IMPORT';
  changes: LogbookFieldChange[];
}

export interface ReconciledLogbookFlight {
  imported: LogbookFlightInput;
  existing?: LogbookFlight;
  status: 'NEW' | 'UNCHANGED' | 'CHANGED';
  changes: LogbookFieldChange[];
}

const COMPARABLE_FIELDS: { key: keyof LogbookFlightInput; label: string }[] = [
  { key: 'date', label: 'Date' }, { key: 'aircraftType', label: 'Aircraft type' },
  { key: 'callsign', label: 'Registration' }, { key: 'crew', label: 'Crew' },
  { key: 'picName', label: 'PIC name' }, { key: 'pilotRole', label: 'Pilot function' },
  { key: 'departureAirport', label: 'From' }, { key: 'arrivalAirport', label: 'To' },
  { key: 'departureTime', label: 'Takeoff' }, { key: 'landingTime', label: 'Landing' },
  { key: 'blockOffTime', label: 'Block off' }, { key: 'blockOnTime', label: 'Block on' },
  { key: 'landingsTotal', label: 'Landings' }, { key: 'landingsDay', label: 'Day landings' },
  { key: 'landingsNight', label: 'Night landings' }, { key: 'airtimeMinutes', label: 'Air time' },
  { key: 'flightTimeMinutes', label: 'Block time' }, { key: 'picMinutes', label: 'PIC time' },
  { key: 'dualMinutes', label: 'Dual time' }, { key: 'instructorMinutes', label: 'Instructor time' },
  { key: 'nightMinutes', label: 'Night time' }, { key: 'ifrMinutes', label: 'IFR time' },
  { key: 'priceCategory', label: 'Price category' }, { key: 'remarks', label: 'Remarks' },
  { key: 'track', label: 'Track' }, { key: 'capzlog', label: 'capzlog.aero ID' },
  { key: 'cloudlog', label: 'CloudLog ID' }, { key: 'status', label: 'Status' }
];

const comparableValue = (value: unknown): string => value === null || value === undefined ? '' : String(value).trim();

export function logbookFlightChanges(existing: LogbookFlight, imported: LogbookFlightInput): LogbookFieldChange[] {
  return COMPARABLE_FIELDS.flatMap(({ key, label }) => {
    const before = comparableValue(key === 'status' ? (existing.status ?? 'COMPLETE') : existing[key]);
    const after = comparableValue(key === 'status' ? (imported.status ?? 'COMPLETE') : imported[key]);
    return before === after ? [] : [{ field: key, label, before, after }];
  });
}

function sameImportIdentity(existing: LogbookFlight, imported: LogbookFlightInput): boolean {
  if (imported.capzlog && existing.capzlog === imported.capzlog) return true;
  if (imported.cloudlog && existing.cloudlog === imported.cloudlog) return true;
  const operationalKey = (flight: Pick<LogbookFlightInput, 'date' | 'callsign' | 'departureAirport' | 'arrivalAirport' | 'blockOffTime'>) =>
    [flight.date, flight.callsign, flight.departureAirport, flight.arrivalAirport, flight.blockOffTime]
      .map((value) => value.trim().toUpperCase()).join('|');
  if (operationalKey(existing) === operationalKey(imported)) return true;
  return Boolean(
    imported.source && imported.sourceRow !== null
    && existing.source === imported.source && existing.sourceRow === imported.sourceRow
    && existing.date === imported.date && existing.callsign.trim().toUpperCase() === imported.callsign.trim().toUpperCase()
  );
}

export function reconcileLogbookFlights(existingFlights: LogbookFlight[], importedFlights: LogbookFlightInput[]): ReconciledLogbookFlight[] {
  return importedFlights.map((imported) => {
    const existing = existingFlights.find((flight) => sameImportIdentity(flight, imported));
    if (!existing) return { imported, status: 'NEW', changes: [] };
    const changes = logbookFlightChanges(existing, imported);
    return { imported, existing, status: changes.length === 0 ? 'UNCHANGED' : 'CHANGED', changes };
  });
}

export function formatMinutes(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  return `${Math.floor(safeMinutes / 60)}:${String(safeMinutes % 60).padStart(2, '0')}`;
}

export function formatRecordedMinutes(totalMinutes: number): string {
  return totalMinutes > 0 ? formatMinutes(totalMinutes) : '';
}

export function shouldAutoGenerateWeatherBriefing(sourceRow: number | null | undefined): boolean {
  return sourceRow == null;
}

export function parseDuration(value: string): number {
  const match = value.trim().match(/^(\d+):([0-5]\d)$/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function logbookCompletionErrors(flight: Pick<LogbookFlightInput, 'date' | 'callsign' | 'departureAirport' | 'arrivalAirport' | 'flightTimeMinutes'>): string[] {
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(flight.date.trim())) errors.push('a date in YYYY-MM-DD format');
  if (!flight.callsign.trim()) errors.push('an aircraft registration');
  if (!flight.departureAirport.trim()) errors.push('a departure airport');
  if (!flight.arrivalAirport.trim()) errors.push('an arrival airport');
  if (flight.flightTimeMinutes <= 0) errors.push('a block time greater than 0:00');
  return errors;
}

export function minutesBetweenTimes(start: string, end: string): number | null {
  const parseTime = (value: string): number | null => {
    const match = value.trim().match(/^(\d{1,2}):([0-5]\d)$/);
    if (!match) return null;
    const hours = Number(match[1]);
    if (hours > 23) return null;
    return hours * 60 + Number(match[2]);
  };
  const startMinutes = parseTime(start);
  const endMinutes = parseTime(end);
  if (startMinutes === null || endMinutes === null) return null;
  const difference = endMinutes - startMinutes;
  return difference >= 0 ? difference : difference + 24 * 60;
}

export function flightFingerprint(flight: Pick<LogbookFlightInput,
  'date' | 'callsign' | 'departureAirport' | 'arrivalAirport' | 'blockOffTime' | 'blockOnTime' | 'flightTimeMinutes'>): string {
  return [
    flight.date,
    flight.callsign,
    flight.departureAirport,
    flight.arrivalAirport,
    flight.blockOffTime,
    flight.blockOnTime,
    flight.flightTimeMinutes
  ].map((value) => String(value).trim().toUpperCase()).join('|');
}
