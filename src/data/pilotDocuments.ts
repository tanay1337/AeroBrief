import type { SQLiteDatabase } from 'expo-sqlite';
import { deleteStoredFilesForPilotDocument } from '@/data/pilotDocumentFiles';
import type { PilotDocument, PilotDocumentInput, PilotDocumentType } from '@/domain/pilotDocuments';

interface PilotDocumentRow {
  id: string;
  type: PilotDocumentType;
  title: string;
  document_number: string;
  issuer: string;
  issue_date: string;
  expiry_date: string;
  notes: string;
  created_at: number;
  updated_at: number;
}

const fromRow = (row: PilotDocumentRow): PilotDocument => ({
  id: row.id,
  type: row.type,
  title: row.title,
  documentNumber: row.document_number,
  issuer: row.issuer,
  issueDate: row.issue_date,
  expiryDate: row.expiry_date,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export async function getPilotDocuments(db: SQLiteDatabase): Promise<PilotDocument[]> {
  const rows = await db.getAllAsync<PilotDocumentRow>(
    `SELECT * FROM pilot_documents
     ORDER BY CASE WHEN expiry_date = '' THEN 1 ELSE 0 END, expiry_date, title`
  );
  return rows.map(fromRow);
}

export async function getPilotDocument(db: SQLiteDatabase, id: string): Promise<PilotDocument | null> {
  const row = await db.getFirstAsync<PilotDocumentRow>('SELECT * FROM pilot_documents WHERE id = ?', id);
  return row ? fromRow(row) : null;
}

export async function savePilotDocument(db: SQLiteDatabase, document: PilotDocumentInput): Promise<string> {
  const now = Date.now();
  const id = document.id ?? `document-${now}-${Math.random().toString(36).slice(2, 10)}`;
  if (!document.id) {
    await db.runAsync(
      `INSERT INTO pilot_documents (
        id, type, title, document_number, issuer, issue_date, expiry_date, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, document.type, document.title, document.documentNumber, document.issuer,
      document.issueDate, document.expiryDate, document.notes, now, now
    );
    return id;
  }
  await db.runAsync(
    `UPDATE pilot_documents SET
      type = ?, title = ?, document_number = ?, issuer = ?, issue_date = ?, expiry_date = ?, notes = ?, updated_at = ?
     WHERE id = ?`,
    document.type, document.title, document.documentNumber, document.issuer,
    document.issueDate, document.expiryDate, document.notes, now, id
  );
  return id;
}

export async function deletePilotDocument(db: SQLiteDatabase, id: string): Promise<void> {
  await deleteStoredFilesForPilotDocument(db, id);
  await db.runAsync('DELETE FROM pilot_documents WHERE id = ?', id);
}
