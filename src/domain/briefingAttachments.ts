import type { LogbookAttachmentCategory } from './logbook';

export function briefingAttachmentTitle(category: LogbookAttachmentCategory): string {
  return category === 'APPROACH_PLATE' ? 'Approach plate' : category === 'AERODROME_LAYOUT' ? 'Aerodrome layout' : category === 'NOTAM_BRIEFING' ? 'NOTAM briefing' : 'Attachment';
}
export function attachmentAddedAt(createdAt: number): string {
  if (!Number.isFinite(createdAt)) return '';
  return new Date(createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).replace(',', '') + ' UTC';
}
/** Display metadata is independent of the original filename and never changes the stored file URI. */
export function briefingAttachmentName(category: LogbookAttachmentCategory, airport: string | null, createdAt: number, mimeType: string): string {
  const title = briefingAttachmentTitle(category);
  const extension = mimeType === 'image/png' ? 'png' : mimeType.startsWith('image/') ? 'jpg' : 'pdf';
  return [airport, title, attachmentAddedAt(createdAt)].filter(Boolean).join(' · ') + '.' + extension;
}
