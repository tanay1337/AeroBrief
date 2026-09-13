import type { SQLiteDatabase } from 'expo-sqlite';
import { logbookFlightChanges, type ImportResult, type LogbookChange, type LogbookFlight, type LogbookFlightInput, type LogbookStatus, type PilotRole } from '@/domain/logbook';
import { deleteStoredAttachmentsForFlight } from '@/data/logbookAttachments';

export const logbookChangeHistoryQueryKey = (flightId: string | undefined) => ['logbook-change-history', flightId] as const;

interface LogbookRow {
  id: string;
  date: string;
  aircraft_type: string;
  callsign: string;
  crew: string;
  pic_name: string;
  pilot_role: PilotRole;
  departure_airport: string;
  arrival_airport: string;
  departure_time: string;
  landing_time: string;
  block_off_time: string;
  block_on_time: string;
  landings_total: number;
  landings_day: number | null;
  landings_night: number | null;
  airtime_minutes: number;
  flight_time_minutes: number;
  pic_minutes: number;
  dual_minutes: number;
  instructor_minutes: number;
  night_minutes: number;
  ifr_minutes: number;
  price_category: string;
  remarks: string;
  track: string;
  capzlog: string;
  cloudlog: string;
  source: string;
  source_row: number | null;
  source_fingerprint: string;
  needs_review: number;
  status?: LogbookStatus;
  created_at: number;
  updated_at: number;
}

const fromRow = (row: LogbookRow): LogbookFlight => ({
  id: row.id,
  date: row.date,
  aircraftType: row.aircraft_type,
  callsign: row.callsign,
  crew: row.crew,
  picName: row.pic_name,
  pilotRole: row.pilot_role,
  departureAirport: row.departure_airport,
  arrivalAirport: row.arrival_airport,
  departureTime: row.departure_time,
  landingTime: row.landing_time,
  blockOffTime: row.block_off_time,
  blockOnTime: row.block_on_time,
  landingsTotal: row.landings_total,
  landingsDay: row.landings_day,
  landingsNight: row.landings_night,
  airtimeMinutes: row.airtime_minutes,
  flightTimeMinutes: row.flight_time_minutes,
  picMinutes: row.pic_minutes,
  dualMinutes: row.dual_minutes,
  instructorMinutes: row.instructor_minutes,
  nightMinutes: row.night_minutes,
  ifrMinutes: row.ifr_minutes,
  priceCategory: row.price_category,
  remarks: row.remarks,
  track: row.track,
  capzlog: row.capzlog,
  cloudlog: row.cloudlog,
  source: row.source,
  sourceRow: row.source_row,
  sourceFingerprint: row.source_fingerprint,
  needsReview: row.needs_review === 1,
  status: row.status === 'DRAFT' ? 'DRAFT' : 'COMPLETE',
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const values = (flight: LogbookFlightInput, id: string, now: number) => [
  id, flight.date, flight.aircraftType, flight.callsign, flight.crew, flight.picName, flight.pilotRole,
  flight.departureAirport, flight.arrivalAirport, flight.departureTime, flight.landingTime,
  flight.blockOffTime, flight.blockOnTime, flight.landingsTotal, flight.landingsDay, flight.landingsNight,
  flight.airtimeMinutes, flight.flightTimeMinutes, flight.picMinutes, flight.dualMinutes,
  flight.instructorMinutes, flight.nightMinutes, flight.ifrMinutes, flight.priceCategory, flight.remarks,
  flight.track, flight.capzlog, flight.cloudlog, flight.source, flight.sourceRow, flight.sourceFingerprint,
  flight.needsReview ? 1 : 0, flight.status ?? 'COMPLETE', now, now
];

const insertSql = `INSERT OR IGNORE INTO logbook_flights (
  id, date, aircraft_type, callsign, crew, pic_name, pilot_role, departure_airport, arrival_airport,
  departure_time, landing_time, block_off_time, block_on_time, landings_total, landings_day,
  landings_night, airtime_minutes, flight_time_minutes, pic_minutes, dual_minutes, instructor_minutes,
  night_minutes, ifr_minutes, price_category, remarks, track, capzlog, cloudlog, source, source_row,
  source_fingerprint, needs_review, status, created_at, updated_at
) VALUES (${Array.from({ length: 35 }, () => '?').join(', ')})`;

const updateSql = `UPDATE logbook_flights SET
  date=?, aircraft_type=?, callsign=?, crew=?, pic_name=?, pilot_role=?, departure_airport=?, arrival_airport=?,
  departure_time=?, landing_time=?, block_off_time=?, block_on_time=?, landings_total=?, landings_day=?,
  landings_night=?, airtime_minutes=?, flight_time_minutes=?, pic_minutes=?, dual_minutes=?, instructor_minutes=?,
  night_minutes=?, ifr_minutes=?, price_category=?, remarks=?, track=?, capzlog=?, cloudlog=?, source=?, source_row=?,
  source_fingerprint=?, needs_review=?, status=?, updated_at=? WHERE id=?`;

async function updateFlight(db: SQLiteDatabase, flight: LogbookFlightInput & { id: string }, now: number): Promise<void> {
  await db.runAsync(updateSql, ...values(flight, flight.id, now).slice(1, -2), now, flight.id);
}

async function recordChanges(db: SQLiteDatabase, flightId: string, source: LogbookChange['source'], changes: LogbookChange['changes'], now: number): Promise<void> {
  if (changes.length === 0) return;
  await db.runAsync(
    'INSERT INTO logbook_change_history (id, flight_id, changed_at, source, changes_json) VALUES (?, ?, ?, ?, ?)',
    `change-${now}-${Math.random().toString(36).slice(2, 10)}`, flightId, now, source, JSON.stringify(changes)
  );
}

export async function getLogbookFlights(db: SQLiteDatabase): Promise<LogbookFlight[]> {
  const rows = await db.getAllAsync<LogbookRow>("SELECT * FROM logbook_flights ORDER BY date DESC, CASE WHEN status = 'DRAFT' THEN 0 ELSE 1 END, block_off_time DESC, created_at DESC");
  return rows.map(fromRow);
}

export async function getLogbookFlight(db: SQLiteDatabase, id: string): Promise<LogbookFlight | null> {
  const row = await db.getFirstAsync<LogbookRow>('SELECT * FROM logbook_flights WHERE id = ?', id);
  return row ? fromRow(row) : null;
}

export async function getLatestLogbookChanges(db: SQLiteDatabase): Promise<Record<string, LogbookChange>> {
  const rows = await db.getAllAsync<{ id: string; flight_id: string; changed_at: number; source: LogbookChange['source']; changes_json: string }>(
    `SELECT history.* FROM logbook_change_history history
     INNER JOIN (SELECT flight_id, MAX(changed_at) AS changed_at FROM logbook_change_history GROUP BY flight_id) latest
     ON latest.flight_id = history.flight_id AND latest.changed_at = history.changed_at`
  );
  return Object.fromEntries(rows.map((row) => [row.flight_id, {
    id: row.id,
    flightId: row.flight_id,
    changedAt: row.changed_at,
    source: row.source,
    changes: JSON.parse(row.changes_json) as LogbookChange['changes']
  }]));
}

export async function getLogbookChanges(db: SQLiteDatabase, flightId: string): Promise<LogbookChange[]> {
  const rows = await db.getAllAsync<{ id: string; flight_id: string; changed_at: number; source: LogbookChange['source']; changes_json: string }>(
    'SELECT * FROM logbook_change_history WHERE flight_id = ? ORDER BY changed_at DESC',
    flightId
  );
  return rows.map((row) => ({
    id: row.id,
    flightId: row.flight_id,
    changedAt: row.changed_at,
    source: row.source,
    changes: JSON.parse(row.changes_json) as LogbookChange['changes']
  }));
}

export async function importLogbookFlights(db: SQLiteDatabase, flights: LogbookFlightInput[]): Promise<ImportResult> {
  let inserted = 0;
  await db.withTransactionAsync(async () => {
    for (const flight of flights) {
      const now = Date.now();
      const id = flight.id ?? `flight-${now}-${Math.random().toString(36).slice(2, 10)}`;
      const result = await db.runAsync(insertSql, ...values(flight, id, now));
      inserted += result.changes;
    }
  });
  return { inserted, duplicates: flights.length - inserted };
}

export async function saveLogbookFlight(db: SQLiteDatabase, flight: LogbookFlightInput): Promise<string> {
  const now = Date.now();
  const id = flight.id ?? `flight-${now}-${Math.random().toString(36).slice(2, 10)}`;
  if (!flight.id) {
    await db.runAsync(insertSql, ...values(flight, id, now));
    return id;
  }
  const existing = await getLogbookFlight(db, id);
  if (!existing) throw new Error('The flight no longer exists.');
  const changes = logbookFlightChanges(existing, flight);
  await db.withTransactionAsync(async () => {
    await updateFlight(db, { ...flight, id }, now);
    await recordChanges(db, id, 'MANUAL', changes, now);
  });
  return id;
}

export async function applyLogbookImport(
  db: SQLiteDatabase,
  newFlights: LogbookFlightInput[],
  acceptedUpdates: { existing: LogbookFlight; imported: LogbookFlightInput }[],
  unchangedCount: number
): Promise<ImportResult> {
  let inserted = 0;
  let updated = 0;
  await db.withTransactionAsync(async () => {
    for (const flight of newFlights) {
      const now = Date.now();
      const id = flight.id ?? `flight-${now}-${Math.random().toString(36).slice(2, 10)}`;
      const result = await db.runAsync(insertSql, ...values(flight, id, now));
      inserted += result.changes;
    }
    for (const { existing, imported } of acceptedUpdates) {
      const now = Date.now();
      const changes = logbookFlightChanges(existing, imported);
      await updateFlight(db, { ...imported, id: existing.id }, now);
      await recordChanges(db, existing.id, 'IMPORT', changes, now);
      updated += 1;
    }
  });
  return { inserted, updated, duplicates: unchangedCount + (newFlights.length - inserted) };
}

export async function deleteLogbookFlight(db: SQLiteDatabase, id: string): Promise<void> {
  await deleteStoredAttachmentsForFlight(db, id);
  await db.runAsync('DELETE FROM logbook_flights WHERE id = ?', id);
}
