import { englishWarningEvent, mapDwdWarnings } from '../dwd';

describe('DWD warning mapping', () => {
  it('maps active WFS warnings and ignores cancellations', () => {
    const warnings = mapDwdWarnings({
      features: [{
        id: 'warning-1',
        properties: {
          NAME: 'Berlin', STATUS: 'Actual', EVENT: 'STURMBÖEN',
          HEADLINE: 'Amtliche WARNUNG vor STURMBÖEN', DESCRIPTION: 'Wind gusts expected.',
          ONSET: '2026-09-04T08:00:00Z', EXPIRES: '2026-09-04T12:00:00Z',
          SEVERITY: 'Moderate', WEB: 'https://dwd.de/warnungen'
        }
      }, {
        id: 'cancelled',
        properties: { STATUS: 'Cancel', EVENT: 'GEWITTER' }
      }]
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      id: 'warning-1', regionName: 'Berlin', severity: 'Moderate',
      event: 'Severe wind gusts', headline: 'Moderate DWD warning: Severe wind gusts'
    });
  });

  it('returns an empty list for malformed payloads', () => {
    expect(mapDwdWarnings(null)).toEqual([]);
    expect(mapDwdWarnings({ features: 'invalid' })).toEqual([]);
  });

  it('uses conservative English names for common DWD warning events', () => {
    expect(englishWarningEvent('SCHWERES GEWITTER')).toBe('Severe thunderstorms');
    expect(englishWarningEvent('GLÄTTE')).toBe('Icy conditions');
    expect(englishWarningEvent('unknown event')).toBe('Hazardous weather');
  });
});
