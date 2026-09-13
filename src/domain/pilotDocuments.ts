export type PilotDocumentType = 'IDENTITY' | 'MEDICAL' | 'SECURITY_CLEARANCE' | 'PILOT_LICENCE' | 'OTHER';

export interface PilotDocument {
  id: string;
  type: PilotDocumentType;
  title: string;
  documentNumber: string;
  issuer: string;
  issueDate: string;
  expiryDate: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export type PilotDocumentInput = Omit<PilotDocument, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

export interface PilotDocumentFile {
  id: string;
  documentId: string;
  name: string;
  mimeType: string;
  uri: string;
  sizeBytes: number;
  createdAt: number;
}

export interface PendingPilotDocumentFile {
  name: string;
  mimeType: string;
  uri: string;
  sizeBytes: number;
}

export type DocumentExpiryKind = 'EXPIRED' | 'URGENT' | 'UPCOMING' | 'VALID' | 'NO_EXPIRY';

export interface DocumentExpiryStatus {
  kind: DocumentExpiryKind;
  days: number | null;
  label: string;
}

export const DOCUMENT_TYPE_LABELS: Record<PilotDocumentType, string> = {
  IDENTITY: 'Identity document',
  MEDICAL: 'Medical certificate',
  SECURITY_CLEARANCE: 'Security clearance',
  PILOT_LICENCE: 'Pilot licence',
  OTHER: 'Other document'
};

function localStartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseLocalDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function documentExpiryStatus(expiryDate: string, now = new Date()): DocumentExpiryStatus {
  const expiry = parseLocalDate(expiryDate);
  if (!expiry) return { kind: 'NO_EXPIRY', days: null, label: 'No expiry date' };
  const days = Math.round((localStartOfDay(expiry).getTime() - localStartOfDay(now).getTime()) / 86_400_000);
  if (days < 0) return { kind: 'EXPIRED', days, label: `Expired ${Math.abs(days)} day${days === -1 ? '' : 's'} ago` };
  if (days === 0) return { kind: 'URGENT', days, label: 'Expires today' };
  if (days <= 30) return { kind: 'URGENT', days, label: `Expires in ${days} day${days === 1 ? '' : 's'}` };
  if (days <= 90) return { kind: 'UPCOMING', days, label: `Expires in ${days} days` };
  return { kind: 'VALID', days, label: `Valid until ${expiryDate}` };
}

export function isIsoDateOrBlank(value: string): boolean {
  return value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value);
}
