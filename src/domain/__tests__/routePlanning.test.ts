import { calculateRoute, formatRouteDuration, getAiracCycleAt, windCorrectedNavigation, type RouteWaypoint } from '@/domain/routePlanning';

const eday: RouteWaypoint = { id: '1', ident: 'EDAY', name: 'Strausberg', latitude: 52.5803, longitude: 13.9167, source: 'AIRPORT' };
const eddb: RouteWaypoint = { id: '2', ident: 'EDDB', name: 'Berlin Brandenburg', latitude: 52.3622, longitude: 13.5007, source: 'AIRPORT' };

describe('route planning', () => {
  it('calculates distance, true track, time, and fuel', () => {
    const result = calculateRoute([eday, eddb], 100, 24);
    expect(result.legs).toHaveLength(1);
    expect(result.distanceNm).toBeGreaterThan(19);
    expect(result.distanceNm).toBeLessThan(21);
    expect(result.legs[0]!.trueTrack).toBeGreaterThan(220);
    expect(result.legs[0]!.trueTrack).toBeLessThan(240);
    expect(result.estimatedMinutes).toBeCloseTo(result.distanceNm / 100 * 60, 5);
    expect(result.estimatedFuel).toBeCloseTo(result.distanceNm / 100 * 24, 5);
  });

  it('does not invent time or fuel without assumptions', () => {
    const result = calculateRoute([eday, eddb], null, null);
    expect(result.estimatedMinutes).toBeNull();
    expect(result.estimatedFuel).toBeNull();
    expect(formatRouteDuration(null)).toBe('—');
  });

  it('carries the destination waypoint planned altitude into its leg', () => {
    const result = calculateRoute([eday, { ...eddb, plannedAltitudeFt: 2500, legNote: 'Follow the railway' }], 100, 24);
    expect(result.legs[0]!.plannedAltitudeFt).toBe(2500);
    expect(result.legs[0]!.note).toBe('Follow the railway');
  });

  it('derives the effective cycle used by OpenFlightMaps', () => {
    expect(getAiracCycleAt(new Date('2026-09-09T12:00:00Z'))).toBe('2609');
  });

  it('derives magnetic track from WMM2025 and applies a crosswind correction', () => {
    const result = calculateRoute([eday, eddb], 100, 24, 90, 15, new Date('2026-09-09T12:00:00Z'));
    const leg = result.legs[0]!;
    expect(leg.magneticVariation).not.toBeNull();
    expect(leg.magneticTrack).not.toBeNull();
    expect(leg.windCorrectionAngle).not.toBeNull();
    expect(leg.groundSpeedKt).not.toBeNull();
    expect(leg.magneticHeading).not.toBeNull();
  });

  it('does not invent a wind solution when crosswind exceeds TAS', () => {
    const result = windCorrectedNavigation(0, 30, 90, 40);
    expect(result.possible).toBe(false);
    expect(result.groundSpeedKt).toBeNull();
  });
});

describe('incomplete or calm route wind', () => {
  it('calculates zero WCA and headings for calm wind without a reported direction', () => {
    const solution = windCorrectedNavigation(90, 100, null, 0);
    expect(solution).toEqual({ windCorrectionAngle: 0, groundSpeedKt: 100, possible: true });
    expect(calculateRoute([eday, eddb], 100, 20, null, 0).legs[0]?.magneticHeading).not.toBeNull();
  });
  it('does not invent a correction from missing TAS or variable wind', () => {
    expect(windCorrectedNavigation(90, null, 270, 10).groundSpeedKt).toBeNull();
    expect(windCorrectedNavigation(90, 100, null, 10).windCorrectionAngle).toBeNull();
  });
  it('does not report zero flight time for an empty or single-point route', () => {
    expect(calculateRoute([], 100, 20).estimatedMinutes).toBeNull();
    expect(calculateRoute([eday], 100, 20).estimatedFuel).toBeNull();
  });
  it('rejects non-finite performance instead of displaying invalid estimates', () => {
    expect(calculateRoute([eday, eddb], Infinity, 20).estimatedMinutes).toBeNull();
    expect(calculateRoute([eday, eddb], 100, Infinity).estimatedFuel).toBeNull();
  });
});
