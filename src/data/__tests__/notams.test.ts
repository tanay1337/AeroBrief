import { mapFaaNotamResponse } from '../notams';

describe('FAA international NOTAM response mapping', () => {
  it('maps active airport notices and preserves the ICAO message', () => {
    const result = mapFaaNotamResponse({
      totalNotamCount: 2,
      notamList: [{
        facilityDesignator: 'EDAY', notamNumber: 'C1543/26', status: 'Active',
        startDate: '04/02/2026 0436', endDate: 'PERM',
        traditionalMessageFrom4thWord: 'THR RWY 23 DISPLACED 100M.',
        icaoMessage: 'C1543/26 NOTAMN\nA) EDAY B) 2604020436 C) PERM\nE) THR RWY 23 DISPLACED 100M.'
      }]
    });
    expect(result.total).toBe(2);
    expect(result.notices[0]).toMatchObject({ airport: 'EDAY', number: 'C1543/26', ends: 'PERM' });
    expect(result.notices[0]?.raw).toContain('A) EDAY');
  });

  it('returns a safe empty result for malformed input', () => {
    expect(mapFaaNotamResponse(null)).toEqual({ total: 0, notices: [] });
  });
});
