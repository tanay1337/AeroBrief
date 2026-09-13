import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { normalizeLogbookAttachmentCategory, type LogbookAttachment, type LogbookAttachmentCategory } from '@/domain/logbook';
import type { LocalPickedFile } from '@/data/localFiles';
import { briefingAttachmentName } from '@/domain/briefingAttachments';
import { saveLogbookAttachments } from '@/data/logbookAttachments';

interface AttachmentRow { id: string; flight_id: string; name: string; mime_type: string; uri: string; size_bytes: number; created_at: number; category?: string; airport_ident?: string | null; }
export type PlannedFlightAttachment = LogbookAttachment & { airportIdent: string | null };
export async function getPlannedFlightAttachments(db: SQLiteDatabase, flightId: string): Promise<PlannedFlightAttachment[]> {
  const rows = await db.getAllAsync<AttachmentRow>('SELECT * FROM planned_flight_attachments WHERE flight_id = ? ORDER BY created_at, name', flightId);
  return rows.map((row) => {
    const category = normalizeLogbookAttachmentCategory(row.category ?? 'NOTAM_BRIEFING');
    return { id: row.id, flightId: row.flight_id, name: category === 'GENERAL' ? row.name : briefingAttachmentName(category, row.airport_ident ?? null, row.created_at, row.mime_type ?? 'application/pdf'), mimeType: row.mime_type, uri: row.uri, sizeBytes: row.size_bytes, category, airportIdent: row.airport_ident ?? null, createdAt: row.created_at };
  });
}
export async function savePlannedBriefingAttachment(db: SQLiteDatabase, flightId: string, attachment: LocalPickedFile, category: Exclude<LogbookAttachmentCategory, 'GENERAL'>, airportIdent?: string): Promise<void> {
  const source = new File(attachment.uri);
  let destination: File | null = null;
  try {
    const bytes = await source.bytes();
    const header = Array.from(bytes.slice(0, 1024)).map((byte) => String.fromCharCode(byte)).join('');
    const pdf = header.includes('%PDF-');
    const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (category === 'NOTAM_BRIEFING' && !pdf) throw new Error('Choose a PDF downloaded from DFS. This file is not a PDF.');
    if (!pdf && !png && !jpeg) throw new Error('Choose a PDF, PNG, or JPEG chart.');
    const ident = airportIdent?.trim().toUpperCase() ?? null;
    if (category !== 'NOTAM_BRIEFING' && !ident) throw new Error('Select an aerodrome for this chart.');
    const directory = new Directory(Paths.document, 'planned-flight-attachments', flightId);
    directory.create({ intermediates: true, idempotent: true });
    const id = `planned-attachment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    destination = new File(directory, `${id}.${pdf ? 'pdf' : png ? 'png' : 'jpg'}`);
    await source.copy(destination, { overwrite: true });
    const createdAt = Date.now();
    const mimeType = pdf ? 'application/pdf' : png ? 'image/png' : 'image/jpeg';
    const name = briefingAttachmentName(category, ident, createdAt, mimeType);
    await db.runAsync('INSERT INTO planned_flight_attachments (id, flight_id, name, mime_type, uri, size_bytes, category, created_at, airport_ident) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, flightId, name, pdf ? 'application/pdf' : png ? 'image/png' : 'image/jpeg', destination.uri, bytes.length, category, createdAt, ident);
  } catch (error) {
    if (destination?.exists) destination.delete();
    throw error;
  } finally {
    const staging = source.parentDirectory;
    if ((staging.name.startsWith('planned-notam-') || staging.name.startsWith('planned-chart-')) && staging.exists) staging.delete();
  }
}
export async function savePlannedNotam(db: SQLiteDatabase, flightId: string, attachment: LocalPickedFile): Promise<void> {
  return savePlannedBriefingAttachment(db, flightId, attachment, 'NOTAM_BRIEFING');
}
export async function deletePlannedAttachment(db: SQLiteDatabase, attachment: LogbookAttachment): Promise<void> {
  await db.runAsync('DELETE FROM planned_flight_attachments WHERE id = ? AND flight_id = ?', attachment.id, attachment.flightId);
  const file = new File(attachment.uri);
  if (file.exists) file.delete();
}
export async function carryPlannedAttachmentsToLogbook(db: SQLiteDatabase, plannedFlightId: string, logbookFlightId: string): Promise<void> {
  const attachments = await getPlannedFlightAttachments(db, plannedFlightId);
  await saveLogbookAttachments(db, logbookFlightId, attachments.map((attachment) => ({ ...attachment, sourcePlannedAttachmentId: attachment.id })));
}

export function cleanupPlannedFlightFiles(flightId: string): void {
  const directory = new Directory(Paths.document, 'planned-flight-attachments', flightId);
  if (directory.exists) directory.delete();
}
