import { mapMetar, mapTaf, parseMetarTrends } from '../noaa';

describe('NOAA DTO mapping', () => {
  it('maps a decoded METAR and preserves raw text', () => {
    const result = mapMetar({
      icaoId: 'KJFK', obsTime: 1_788_457_860, metarType: 'METAR',
      rawOb: 'METAR KJFK 031751Z 29012KT 10SM FEW033 SCT250 29/21 A2993',
      temp: 29.4, dewp: 20.6, wdir: 290, wspd: 12, visib: '10+', altim: 1013.6,
      clouds: [{ cover: 'FEW', base: 3300 }, { cover: 'SCT', base: 25000 }], fltCat: 'VFR'
    });
    expect(result).toMatchObject({
      icao: 'KJFK', category: 'VFR', windDirectionTrue: 290,
      visibilitySm: 10, visibilityQualifier: 'MORE_THAN'
    });
    expect(result?.raw).toContain('KJFK');
  });

  it('preserves ICAO 9999 and CAVOK semantics instead of converting NOAA 6+ miles', () => {
    const metric = mapMetar({
      icaoId: 'EDDB', obsTime: 1_788_457_860, rawOb: 'METAR EDDB 040650Z 22012KT 9999 SCT020 19/15 Q1012',
      visib: '6+', clouds: [{ cover: 'SCT', base: 2000 }]
    });
    expect(metric).toMatchObject({
      visibilityIsTenKmOrMore: true,
      visibilityQualifier: 'MORE_THAN',
      cavok: false
    });

    const cavok = mapMetar({
      icaoId: 'EDDF', obsTime: 1_788_457_860, rawOb: 'METAR EDDF 040650Z 24008KT CAVOK 18/12 Q1015',
      visib: '6+', clouds: []
    });
    expect(cavok).toMatchObject({ visibilityIsTenKmOrMore: true, cavok: true });
  });

  it('maps forecast change groups and computes their categories', () => {
    const result = mapTaf({
      icaoId: 'KJFK', issueTime: '2026-09-03T17:40:00.000Z',
      validTimeFrom: 1_788_458_400, validTimeTo: 1_788_566_400, rawTAF: 'TAF KJFK',
      fcsts: [{
        timeFrom: 1_788_458_400, timeTo: 1_788_476_400, fcstChange: null,
        wdir: 240, wspd: 12, visib: '6+', clouds: [{ cover: 'BKN', base: 4000 }]
      }, {
        timeFrom: 1_788_483_600, timeTo: 1_788_505_200, fcstChange: 'PROB', probability: 30,
        visib: 2, wxString: 'TSRA BR', clouds: [{ cover: 'BKN', base: 4000, type: 'CB' }]
      }]
    });
    expect(result?.periods).toHaveLength(2);
    expect(result?.periods[1]).toMatchObject({ change: 'PROB', probability: 30, category: 'IFR' });
  });

  it('decodes METAR trend winds, weather, visibility and clouds', () => {
    expect(parseMetarTrends('METAR EDDB 041420Z AUTO 25026KT 9999 SCT048 26/16 Q1004 TEMPO 26030G40KT SHRA 3000 BKN040CB')).toEqual([{
      change: 'TEMPO',
      raw: 'TEMPO 26030G40KT SHRA 3000 BKN040CB',
      windDirectionTrue: 260,
      windSpeedKt: 30,
      windGustKt: 40,
      visibilitySm: 3000 / 1609.344,
      visibilityIsTenKmOrMore: false,
      weather: ['SHRA'],
      clouds: [{ cover: 'BKN', baseFt: 4000, type: 'CB' }],
      verticalVisibilityFt: null
    }]);
  });

  it('keeps NOSIG in the raw METAR without presenting it as an actionable trend', () => {
    expect(parseMetarTrends('METAR VIDP 041500Z 06004KT 3000 DZ SCT025 BKN090 26/25 Q1007 NOSIG')).toEqual([]);
  });
});
