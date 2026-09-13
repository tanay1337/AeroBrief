import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { PendingPilotDocumentFile, PilotDocumentFile } from '@/domain/pilotDocuments';

interface PilotDocumentFileRow {
  id: string;
  document_id: string;
  name: string;
  mime_type: string;
  uri: string;
  size_bytes: number;
  created_at: number;
}

const fromRow = (row: PilotDocumentFileRow): PilotDocumentFile => ({
  id: row.id,
  documentId: row.document_id,
  name: row.name,
  mimeType: row.mime_type,
  uri: row.uri,
  sizeBytes: row.size_bytes,
  createdAt: row.created_at
});

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._ -]/g, '_').trim();
  return cleaned || 'document';
}

function documentDirectory(documentId: string): Directory {
  const directory = new Directory(Paths.document, 'pilot-documents', documentId);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

export async function getPilotDocumentFiles(db: SQLiteDatabase, documentId: string): Promise<PilotDocumentFile[]> {
  const rows = await db.getAllAsync<PilotDocumentFileRow>(
    'SELECT * FROM pilot_document_files WHERE document_id = ? ORDER BY created_at, name',
    documentId
  );
  return rows.map(fromRow);
}

export async function savePilotDocumentFiles(
  db: SQLiteDatabase,
  documentId: string,
  files: PendingPilotDocumentFile[]
): Promise<void> {
  if (files.length === 0) return;
  const directory = documentDirectory(documentId);
  for (const [index, pending] of files.entries()) {
    const now = Date.now();
    const id = `document-file-${now}-${index}-${Math.random().toString(36).slice(2, 8)}`;
    const destination = new File(directory, `${now}-${index}-${safeFileName(pending.name)}`);
    const source = new File(pending.uri);
    await source.copy(destination, { overwrite: true });
    await db.runAsync(
      `INSERT INTO pilot_document_files (id, document_id, name, mime_type, uri, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id, documentId, pending.name, pending.mimeType, destination.uri, pending.sizeBytes, now
    );
    const stagingDirectory = source.parentDirectory;
    if (stagingDirectory.name.startsWith('pilot-document-') && stagingDirectory.exists) stagingDirectory.delete();
  }
}

export async function deletePilotDocumentFile(db: SQLiteDatabase, fileRecord: PilotDocumentFile): Promise<void> {
  const file = new File(fileRecord.uri);
  if (file.exists) file.delete();
  await db.runAsync('DELETE FROM pilot_document_files WHERE id = ?', fileRecord.id);
}

export async function deleteStoredFilesForPilotDocument(db: SQLiteDatabase, documentId: string): Promise<void> {
  const files = await getPilotDocumentFiles(db, documentId);
  for (const fileRecord of files) {
    const file = new File(fileRecord.uri);
    if (file.exists) file.delete();
  }
  const directory = new Directory(Paths.document, 'pilot-documents', documentId);
  if (directory.exists) directory.delete();
}
