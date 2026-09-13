import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { normalizeLogbookAttachmentCategory, type LogbookAttachment, type PendingLogbookAttachment } from '@/domain/logbook';

interface AttachmentRow {
  id: string;
  flight_id: string;
  name: string;
  mime_type: string;
  uri: string;
  size_bytes: number;
  category: string;
  created_at: number;
}

const fromRow = (row: AttachmentRow): LogbookAttachment => ({
  id: row.id,
  flightId: row.flight_id,
  name: row.name,
  mimeType: row.mime_type,
  uri: row.uri,
  sizeBytes: row.size_bytes,
  category: normalizeLogbookAttachmentCategory(row.category),
  createdAt: row.created_at
});

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._ -]/g, '_').trim();
  return cleaned || 'attachment';
}

function flightDirectory(flightId: string): Directory {
  const directory = new Directory(Paths.document, 'logbook-attachments', flightId);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

export async function getLogbookAttachments(db: SQLiteDatabase, flightId: string): Promise<LogbookAttachment[]> {
  const rows = await db.getAllAsync<AttachmentRow>(
    'SELECT * FROM logbook_attachments WHERE flight_id = ? ORDER BY created_at, name',
    flightId
  );
  return rows.map(fromRow);
}

export async function getLogbookImageThumbnails(db: SQLiteDatabase): Promise<Record<string, string>> {
  const rows = await db.getAllAsync<{ flight_id: string; uri: string }>(
    `SELECT flight_id, uri FROM logbook_attachments
     WHERE mime_type LIKE 'image/%' AND category = 'GENERAL' ORDER BY created_at DESC`
  );
  const thumbnails: Record<string, string> = {};
  for (const row of rows) if (!thumbnails[row.flight_id]) thumbnails[row.flight_id] = row.uri;
  return thumbnails;
}

export async function saveLogbookAttachments(
  db: SQLiteDatabase,
  flightId: string,
  attachments: (PendingLogbookAttachment & { sourcePlannedAttachmentId?: string })[]
): Promise<void> {
  if (attachments.length === 0) return;
  const directory = flightDirectory(flightId);
  for (const [index, attachment] of attachments.entries()) {
    if (attachment.sourcePlannedAttachmentId) {
      const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM logbook_attachments WHERE flight_id = ? AND source_planned_attachment_id = ?', flightId, attachment.sourcePlannedAttachmentId);
      if (existing) continue;
    }
    const now = Date.now();
    const id = `attachment-${now}-${index}-${Math.random().toString(36).slice(2, 8)}`;
    const storedName = `${now}-${index}-${safeFileName(attachment.name)}`;
    const destination = new File(directory, storedName);
    const source = new File(attachment.uri);
    try {
      await source.copy(destination, { overwrite: true });
      await db.runAsync(
      `INSERT INTO logbook_attachments (id, flight_id, name, mime_type, uri, size_bytes, category, created_at, source_planned_attachment_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      flightId,
      attachment.name,
      attachment.mimeType,
      destination.uri,
      attachment.sizeBytes,
      normalizeLogbookAttachmentCategory(attachment.category),
      now,
      attachment.sourcePlannedAttachmentId ?? null
      );
    } catch (error) {
      if (destination.exists) destination.delete();
      throw error;
    }
    const stagingDirectory = source.parentDirectory;
    if (stagingDirectory.name.startsWith('logbook-attachment-') && stagingDirectory.exists) stagingDirectory.delete();
  }
}

export async function deleteLogbookAttachment(db: SQLiteDatabase, attachment: LogbookAttachment): Promise<void> {
  const file = new File(attachment.uri);
  if (file.exists) file.delete();
  await db.runAsync('DELETE FROM logbook_attachments WHERE id = ?', attachment.id);
}

export async function deleteStoredAttachmentsForFlight(db: SQLiteDatabase, flightId: string): Promise<void> {
  const attachments = await getLogbookAttachments(db, flightId);
  for (const attachment of attachments) {
    const file = new File(attachment.uri);
    if (file.exists) file.delete();
  }
  const directory = new Directory(Paths.document, 'logbook-attachments', flightId);
  if (directory.exists) directory.delete();
}
