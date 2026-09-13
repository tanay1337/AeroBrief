import { formatRecordedMinutes, logbookCompletionErrors, minutesBetweenTimes, normalizeLogbookAttachmentCategory, reconcileLogbookFlights, shouldAutoGenerateWeatherBriefing, type LogbookFlight, type LogbookFlightInput } from '@/domain/logbook';

describe('logbook time calculations', () => {
  it('calculates same-day durations', () => {
    expect(minutesBetweenTimes('12:42', '14:00')).toBe(78);
  });

  it('handles a flight crossing midnight', () => {
    expect(minutesBetweenTimes('23:40', '00:45')).toBe(65);
  });

  it('rejects incomplete or invalid clock times', () => {
    expect(minutesBetweenTimes('', '14:00')).toBeNull();
    expect(minutesBetweenTimes('25:00', '02:00')).toBeNull();
  });

  it('omits zero-duration values from read-only records', () => {
    expect(formatRecordedMinutes(0)).toBe('');
    expect(formatRecordedMinutes(-4)).toBe('');
    expect(formatRecordedMinutes(67)).toBe('1:07');
  });

  it('does not generate weather briefings for imported rows', () => {
    expect(shouldAutoGenerateWeatherBriefing(7)).toBe(false);
    expect(shouldAutoGenerateWeatherBriefing(null)).toBe(true);
    expect(shouldAutoGenerateWeatherBriefing(undefined)).toBe(true);
  });

  it('distinguishes incomplete drafts from complete flight records', () => {
    expect(logbookCompletionErrors({ date: '2026-09-07', callsign: '', departureAirport: 'EDAY', arrivalAirport: '', flightTimeMinutes: 0 })).toEqual([
      'an aircraft registration', 'an arrival airport', 'a block time greater than 0:00'
    ]);
    expect(logbookCompletionErrors({ date: '2026-09-07', callsign: 'D-TEST', departureAirport: 'EDAY', arrivalAirport: 'EDAV', flightTimeMinutes: 60 })).toEqual([]);
  });

  it('keeps legacy attachments in the general category', () => {
    expect(normalizeLogbookAttachmentCategory(undefined)).toBe('GENERAL');
    expect(normalizeLogbookAttachmentCategory('APPROACH_PLATE')).toBe('APPROACH_PLATE');
    expect(normalizeLogbookAttachmentCategory('unexpected')).toBe('GENERAL');
  });
});

const importedFlight: LogbookFlightInput = {
  date: '2026-09-07', aircraftType: 'DA20', callsign: 'D-TEST', crew: 'Pilot / Instructor', picName: '', pilotRole: 'DUAL',
  departureAirport: 'EDAY', arrivalAirport: 'EDAV', departureTime: '10:10', landingTime: '10:55', blockOffTime: '10:00', blockOnTime: '11:05',
  landingsTotal: 1, landingsDay: 1, landingsNight: 0, airtimeMinutes: 45, flightTimeMinutes: 65, picMinutes: 0, dualMinutes: 65,
  instructorMinutes: 0, nightMinutes: 0, ifrMinutes: 0, priceCategory: '', remarks: '', track: '', capzlog: 'cap-1', cloudlog: '',
  source: 'Flightlog.xlsx', sourceRow: 3, sourceFingerprint: 'fingerprint', needsReview: false
};

describe('logbook import reconciliation', () => {
  const existing = { ...importedFlight, id: 'flight-1', createdAt: 1, updatedAt: 1 } as LogbookFlight;

  it('keeps an exact reimport unchanged', () => {
    const [result] = reconcileLogbookFlights([existing], [importedFlight]);
    expect(result?.status).toBe('UNCHANGED');
    expect(result?.changes).toEqual([]);
  });

  it('shows field-level differences without changing the existing record', () => {
    const [result] = reconcileLogbookFlights([existing], [{ ...importedFlight, remarks: 'Updated remark', blockOnTime: '11:10', flightTimeMinutes: 70 }]);
    expect(result?.status).toBe('CHANGED');
    expect(result?.existing?.remarks).toBe('');
    expect(result?.changes.map((change) => change.label)).toEqual(['Block on', 'Block time', 'Remarks']);
  });

  it('classifies a different operational identity as new', () => {
    const [result] = reconcileLogbookFlights([existing], [{ ...importedFlight, capzlog: '', sourceRow: 9, callsign: 'D-OTHER' }]);
    expect(result?.status).toBe('NEW');
  });
});
