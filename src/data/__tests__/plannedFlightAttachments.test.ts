import type { SQLiteDatabase } from 'expo-sqlite';
import { carryPlannedAttachmentsToLogbook, savePlannedNotam, savePlannedBriefingAttachment, getPlannedFlightAttachments } from '../plannedFlightAttachments';

const mockFiles = new Map<string, Uint8Array>();
const mockDirectories = new Set<string>();
jest.mock('expo-file-system', () => {
  const path = (...parts: (string | { uri: string })[]) => parts.map((part) => typeof part === 'string' ? part : part.uri).join('/');
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = path(...parts); }
    get name() { return this.uri.split('/').at(-1)!; }
    get exists() { return mockDirectories.has(this.uri); }
    create() { mockDirectories.add(this.uri); }
    delete() { for (const key of mockFiles.keys()) if (key.startsWith(this.uri + '/')) mockFiles.delete(key); mockDirectories.delete(this.uri); }
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) { this.uri = path(...parts); }
    get exists() { return mockFiles.has(this.uri); }
    get parentDirectory() { return new Directory(this.uri.slice(0, this.uri.lastIndexOf('/'))); }
    async bytes() { return mockFiles.get(this.uri)!; }
    async copy(destination: File) { mockFiles.set(destination.uri, await this.bytes()); }
    delete() { mockFiles.delete(this.uri); }
  }
  return { File, Directory, Paths: { document: 'file:///documents' } };
});

beforeEach(() => { mockFiles.clear(); mockDirectories.clear(); });
it('stores a picked PDF in permanent flight storage and rejects a non-PDF', async () => {
  const runAsync = jest.fn().mockResolvedValue({ changes: 1 });
  const db = { runAsync } as unknown as SQLiteDatabase;
  mockFiles.set('file:///picked.pdf', Uint8Array.from(Array.from('%PDF-1.7\ncontent').map((letter) => letter.charCodeAt(0))));
  await savePlannedNotam(db, 'p1', { uri: 'file:///picked.pdf', name: 'DFS.pdf', mimeType: 'application/pdf', sizeBytes: 16 });
  const args = runAsync.mock.calls[0]!;
  expect(args[5]).toContain('file:///documents/planned-flight-attachments/p1/');
  expect(mockFiles.has(args[5])).toBe(true);
  mockFiles.set('file:///invalid.pdf', Uint8Array.from([60, 104, 116, 109, 108, 62]));
  await expect(savePlannedNotam(db, 'p1', { uri: 'file:///invalid.pdf', name: 'invalid.pdf', mimeType: 'application/pdf', sizeBytes: 6 })).rejects.toThrow('not a PDF');
  expect(runAsync).toHaveBeenCalledTimes(1);
});
it('copies the planned PDF to the log and avoids duplicates on a repeated save', async () => {
  mockFiles.set('file:///plan-notam.pdf', Uint8Array.from([37, 80, 68, 70, 45]));
  const getFirstAsync = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'existing-copy' });
  const runAsync = jest.fn().mockResolvedValue({ changes: 1 });
  const db = { getFirstAsync, runAsync, getAllAsync: jest.fn().mockResolvedValue([{ id: 'source-1', flight_id: 'p1', name: 'DFS.pdf', mime_type: 'application/pdf', uri: 'file:///plan-notam.pdf', size_bytes: 5, created_at: 1 }]) } as unknown as SQLiteDatabase;
  await carryPlannedAttachmentsToLogbook(db, 'p1', 'logged-1');
  const args = runAsync.mock.calls[0]!;
  expect(args[5]).toContain('/logbook-attachments/logged-1/');
  expect(args[9]).toBe('source-1');
  expect(mockFiles.has(args[5])).toBe(true);
  mockFiles.delete('file:///plan-notam.pdf');
  expect(mockFiles.has(args[5])).toBe(true);
  await carryPlannedAttachmentsToLogbook(db, 'p1', 'logged-1');
  expect(runAsync).toHaveBeenCalledTimes(1);
});
it('removes a copied file when saving its attachment row fails', async () => {
  mockFiles.set('file:///picked.pdf', Uint8Array.from([37, 80, 68, 70, 45]));
  const db = { runAsync: jest.fn().mockRejectedValue(new Error('database failed')) } as unknown as SQLiteDatabase;
  await expect(savePlannedNotam(db, 'p1', { uri: 'file:///picked.pdf', name: 'DFS.pdf', mimeType: 'application/pdf', sizeBytes: 5 })).rejects.toThrow('database failed');
  expect([...mockFiles.keys()].filter((uri) => uri.includes('planned-flight-attachments'))).toEqual([]);
});

it('preserves chart categories and their aerodromes when reading mixed attachments', async () => {
  const db = { getAllAsync: jest.fn().mockResolvedValue([
    { id: 'a', flight_id: 'p1', category: 'APPROACH_PLATE', airport_ident: 'EDAY', name: 'EDAY - approach.pdf' },
    { id: 'b', flight_id: 'p1', category: 'AERODROME_LAYOUT', airport_ident: 'EDCE', name: 'EDCE - layout.png' },
    { id: 'c', flight_id: 'p1', name: 'Legacy NOTAM.pdf' }
  ]) } as unknown as SQLiteDatabase;
  expect((await getPlannedFlightAttachments(db, 'p1')).map((file) => [file.category, file.airportIdent])).toEqual([
    ['APPROACH_PLATE', 'EDAY'], ['AERODROME_LAYOUT', 'EDCE'], ['NOTAM_BRIEFING', null]
  ]);
});
it('stores chart images with detected format and airport identity, rejecting unscoped charts', async () => {
  mockFiles.set('file:///layout.png', Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]));
  const runAsync = jest.fn().mockResolvedValue({ changes: 1 });
  const db = { runAsync } as unknown as SQLiteDatabase;
  const picked = { uri: 'file:///layout.png', name: 'layout.png', mimeType: 'application/octet-stream', sizeBytes: 9 };
  await savePlannedBriefingAttachment(db, 'p1', picked, 'AERODROME_LAYOUT', 'eday');
  const args = runAsync.mock.calls[0]!;
  expect(args[3]).toMatch(/^EDAY · Aerodrome layout · .* UTC\.png$/);
  expect(args[4]).toBe('image/png');
  expect(args[7]).toBe('AERODROME_LAYOUT');
  expect(args[9]).toBe('EDAY');
  await expect(savePlannedBriefingAttachment(db, 'p1', picked, 'APPROACH_PLATE')).rejects.toThrow('Select an aerodrome');
  expect(runAsync).toHaveBeenCalledTimes(1);
});
it('replaces opaque imported filenames with readable metadata while leaving file paths unchanged', async () => {
  const db = { getAllAsync: jest.fn().mockResolvedValue([
    { id: 'chart', flight_id: 'p1', name: 'EDAY - AAACA7L2NQM.png', category: 'APPROACH_PLATE', airport_ident: 'EDAY', uri: 'file:///original-chart.png', mime_type: 'image/png', created_at: Date.UTC(2026, 8, 13, 14, 11) },
    { id: 'notam', flight_id: 'p1', name: 'PIB_EDDZ2609131158_20260913_1210r1.pdf', category: 'NOTAM_BRIEFING', uri: 'file:///original-notam.pdf', mime_type: 'application/pdf', created_at: Date.UTC(2026, 8, 13, 14, 12) }
  ]) } as unknown as SQLiteDatabase;
  const files = await getPlannedFlightAttachments(db, 'p1');
  expect(files[0]).toMatchObject({ name: 'EDAY · Approach plate · 13 Sept 2026 14:11 UTC.png', uri: 'file:///original-chart.png' });
  expect(files[1]?.name).toContain('NOTAM briefing');
  expect(files[1]?.name).not.toContain('PIB_EDDZ');
});
it('copies both chart categories and NOTAMs into independent, correctly categorized logbook files', async () => {
  const categories = ['APPROACH_PLATE', 'AERODROME_LAYOUT', 'NOTAM_BRIEFING'];
  const rows = categories.map((category, index) => {
    const uri = `file:///chart-${index}.pdf`;
    mockFiles.set(uri, Uint8Array.from([37, 80, 68, 70, 45]));
    return { id: `source-${index}`, flight_id: 'p1', name: `EDAY - chart-${index}.pdf`, category, airport_ident: index < 2 ? 'EDAY' : null, uri, mime_type: 'application/pdf', size_bytes: 5, created_at: index };
  });
  const runAsync = jest.fn().mockResolvedValue({ changes: 1 });
  const db = { getAllAsync: jest.fn().mockResolvedValue(rows), getFirstAsync: jest.fn().mockResolvedValue(null), runAsync } as unknown as SQLiteDatabase;
  await carryPlannedAttachmentsToLogbook(db, 'p1', 'logged-1');
  expect(runAsync.mock.calls.map((args) => args[7])).toEqual(categories);
  for (const [index, args] of runAsync.mock.calls.entries()) {
    expect(args[9]).toBe(`source-${index}`);
    mockFiles.delete(rows[index]!.uri);
    expect(mockFiles.has(args[5])).toBe(true);
  }
});
