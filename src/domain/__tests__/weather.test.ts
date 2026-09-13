import {
  buildTafTimeline,
  calculateFlightCategory,
  calculateRunwayWind,
  displayedTafPeriod,
  lowestCeilingFt,
  parseVisibility,
  tafProbabilityLabel,
  upcomingTafHours
} from '../weather';
import type { TafForecast, TafPeriod } from '../models';

const period = (overrides: Partial<TafPeriod> = {}): TafPeriod => ({
  from: 1_700_000_000,
  to: 1_700_010_800,
  becomingAt: null,
  change: 'BASE',
  probability: null,
  windDirectionTrue: 240,
  windSpeedKt: 10,
  windGustKt: null,
  visibilitySm: 6,
  visibilityQualifier: 'MORE_THAN',
  visibilityIsTenKmOrMore: false,
  weather: [],
  clouds: [{ cover: 'SCT', baseFt: 4000, type: null }],
  verticalVisibilityFt: null,
  category: 'VFR',
  ...overrides
});

describe('flight category', () => {
  test.each([
    [10, 5000, 'VFR'],
    [5, 5000, 'MVFR'],
    [10, 3000, 'MVFR'],
    [2.9, 5000, 'IFR'],
    [10, 999, 'IFR'],
    [0.9, 5000, 'LIFR'],
    [10, 499, 'LIFR'],
    [null, null, 'UNKNOWN']
  ] as const)('visibility %s and ceiling %s is %s', (visibility, ceiling, expected) => {
    expect(calculateFlightCategory(visibility, ceiling)).toBe(expected);
  });

  it('uses broken and overcast layers as ceilings', () => {
    expect(lowestCeilingFt([
      { cover: 'SCT', baseFt: 700, type: null },
      { cover: 'BKN', baseFt: 1500, type: null },
      { cover: 'OVC', baseFt: 2300, type: null }
    ])).toBe(1500);
  });
});

describe('visibility parsing', () => {
  it('handles numeric and bounded NOAA values', () => {
    expect(parseVisibility('10+')).toEqual({ valueSm: 10, qualifier: 'MORE_THAN' });
    expect(parseVisibility('M0.25')).toEqual({ valueSm: 0.25, qualifier: 'LESS_THAN' });
    expect(parseVisibility(6)).toEqual({ valueSm: 6, qualifier: null });
    expect(parseVisibility('unknown')).toEqual({ valueSm: null, qualifier: null });
  });
});

describe('runway wind components', () => {
  it('calculates direct headwind', () => {
    const result = calculateRunwayWind('27', 270, 270, 20, 30);
    expect(result?.crosswindKt).toBeCloseTo(0, 5);
    expect(result?.headwindKt).toBeCloseTo(20, 5);
    expect(result?.gustHeadwindKt).toBeCloseTo(30, 5);
  });

  it('calculates crosswind and tailwind signs', () => {
    const crosswind = calculateRunwayWind('18', 180, 270, 12, null);
    expect(crosswind?.crosswindKt).toBeCloseTo(12, 5);
    expect(crosswind?.headwindKt).toBeCloseTo(0, 5);
    const tailwind = calculateRunwayWind('09', 90, 270, 12, null);
    expect(tailwind?.headwindKt).toBeCloseTo(-12, 5);
  });

  it('does not guess variable wind', () => {
    expect(calculateRunwayWind('09', 90, null, 8, null)).toBeNull();
  });
});

describe('TAF timeline', () => {
  it('keeps probability conditions as overlays', () => {
    const base = period();
    const probability = period({
      from: 1_700_003_600,
      to: 1_700_007_200,
      change: 'PROB',
      probability: 30,
      category: 'IFR'
    });
    const forecast: TafForecast = {
      icao: 'KJFK', raw: 'TAF KJFK', issuedAt: base.from,
      validFrom: base.from, validTo: base.to, periods: [base, probability]
    };
    const timeline = buildTafTimeline(forecast);
    expect(timeline).toHaveLength(4);
    expect(timeline.some((hour) => hour.overlays[0]?.probability === 30)).toBe(true);
    expect(timeline.every((hour) => hour.prevailing?.change === 'BASE')).toBe(true);
  });

  it('uses BECMG groups as prevailing conditions instead of leaving empty hours', () => {
    const base = period({ from: 1_699_999_200, to: 1_700_002_800 });
    const becoming = period({
      from: 1_700_002_800,
      to: 1_700_010_000,
      becomingAt: 1_700_006_400,
      change: 'BECMG',
      windSpeedKt: 20
    });
    const forecast: TafForecast = {
      icao: 'EDDB', raw: 'TAF EDDB', issuedAt: base.from,
      validFrom: base.from, validTo: becoming.to, periods: [base, becoming]
    };
    const timeline = buildTafTimeline(forecast);
    expect(timeline).toHaveLength(3);
    expect(timeline.slice(1).every((hour) => hour.prevailing?.change === 'BECMG')).toBe(true);
  });

  it('surfaces the most limiting temporary condition and inherits omitted values', () => {
    const prevailing = period({ category: 'VFR', windSpeedKt: 20, windGustKt: 30 });
    const overlay = period({
      change: 'TEMPO', probability: 40, visibilitySm: 1.2, visibilityQualifier: null,
      visibilityIsTenKmOrMore: false, windDirectionTrue: null, windSpeedKt: null,
      windGustKt: null, clouds: [], category: 'IFR'
    });
    const displayed = displayedTafPeriod({ at: prevailing.from, prevailing, overlays: [overlay] });
    expect(displayed).toMatchObject({ category: 'IFR', visibilitySm: 1.2, windSpeedKt: 20, windGustKt: 30 });
  });

  it('exposes explicit and tempo probability labels', () => {
    const prevailing = period();
    expect(tafProbabilityLabel({ at: prevailing.from, prevailing, overlays: [period({ change: 'TEMPO', probability: 40 })] })).toBe('40%');
    expect(tafProbabilityLabel({ at: prevailing.from, prevailing, overlays: [period({ change: 'TEMPO' })] })).toBe('>40%');
    expect(tafProbabilityLabel({ at: prevailing.from, prevailing, overlays: [] })).toBe('—');
  });

  it('hides completed TAF hours while retaining the current hour', () => {
    const hours = [
      { at: 1_700_000_000, prevailing: null, overlays: [] },
      { at: 1_700_003_600, prevailing: null, overlays: [] },
      { at: 1_700_007_200, prevailing: null, overlays: [] }
    ];
    const nowMs = 1_700_004_100_000;
    expect(upcomingTafHours(hours, nowMs).map((hour) => hour.at)).toEqual([
      1_700_003_600,
      1_700_007_200
    ]);
  });
});
