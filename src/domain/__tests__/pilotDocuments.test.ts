import { documentExpiryStatus, isIsoDateOrBlank } from '@/domain/pilotDocuments';

describe('pilot document expiry', () => {
  const now = new Date(2026, 8, 6, 12);

  it('separates expired, urgent, upcoming and current documents', () => {
    expect(documentExpiryStatus('2026-09-05', now)).toMatchObject({ kind: 'EXPIRED', days: -1 });
    expect(documentExpiryStatus('2026-09-06', now)).toMatchObject({ kind: 'URGENT', days: 0, label: 'Expires today' });
    expect(documentExpiryStatus('2026-10-06', now)).toMatchObject({ kind: 'URGENT', days: 30 });
    expect(documentExpiryStatus('2026-12-05', now)).toMatchObject({ kind: 'UPCOMING', days: 90 });
    expect(documentExpiryStatus('2027-01-01', now)).toMatchObject({ kind: 'VALID' });
  });

  it('keeps documents without a usable expiry date separate', () => {
    expect(documentExpiryStatus('', now)).toEqual({ kind: 'NO_EXPIRY', days: null, label: 'No expiry date' });
    expect(isIsoDateOrBlank('')).toBe(true);
    expect(isIsoDateOrBlank('2026-09-06')).toBe(true);
    expect(isIsoDateOrBlank('06.09.2026')).toBe(false);
  });
});
