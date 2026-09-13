import { readyProfile } from '@/domain/__tests__/aircraft.test';
import { checkRouteFuel } from '@/domain/routeFuelCheck';
import type { RoutePlan } from '@/domain/routePlanning';
import type { SavedWeightBalanceCalculation } from '@/domain/weightBalance';

function fixture() {
  const profile = readyProfile();
  const route: RoutePlan = { id: 'r', title: 'Route', waypoints: [{ id: 'a', ident: 'AAAA', name: 'A', latitude: 0, longitude: 0, source: 'AIRPORT' }, { id: 'b', ident: 'BBBB', name: 'B', latitude: 1, longitude: 0, source: 'AIRPORT' }], cruiseSpeedKt: 60, fuelBurnPerHour: 20, fuelUnit: 'L', windDirectionTrue: null, windSpeedKt: null, windSource: null, windStation: null, windStationDistanceKm: null, windObservedAt: null, airacCycle: '2609', createdAt: 0, updatedAt: 0 };
  const calculation: SavedWeightBalanceCalculation = { id: 'c', profileId: profile.id, profileGroupId: profile.groupId, profileRevision: profile.revision, registration: profile.registration, title: 'M&B', calculationDate: '2026-09-12', input: { title: 'Load', calculationDate: '2026-09-12', stationLoads: [{ stationId: 'fuel', mass: 0, blockVolume: 50, taxiVolume: 2, tripVolume: 0, fuelFlowPerHour: 20, cruiseMinutes: 60, reserveMinutes: 45, approachDepartureVolume: 3, contingencyPercent: 10, extraVolume: 2 }] }, result: { valid: true, errors: [], warnings: [], states: [] }, logbookFlightId: 'f', createdAt: 0 };
  const flight = { callsign: profile.registration, date: '2026-09-12', departureAirport: 'AAAA', arrivalAirport: 'BBBB' };
  return { profile, route, calculation, flight };
}

describe('attached route fuel reconciliation', () => {
  it('includes all allowances and catches a fuel shortfall', () => {
    const f = fixture();
    const r = checkRouteFuel(f.route, f.calculation, f.profile, f.flight);
    expect(r.status).toBe('covered');
    expect(r.required).toBeCloseTo(44, 0);
    expect(r.reserve).toBe(15);
    f.calculation.input.stationLoads[0]!.blockVolume = 40;
    expect(checkRouteFuel(f.route, f.calculation, f.profile, f.flight).status).toBe('shortfall');
  });
  it('converts route US gallons into the mass-and-balance litres', () => {
    const f = fixture();
    const a = checkRouteFuel(f.route, f.calculation, f.profile, f.flight);
    f.route.fuelBurnPerHour! /= 3.785411784; f.route.fuelUnit = 'US_GAL';
    expect(checkRouteFuel(f.route, f.calculation, f.profile, f.flight).required).toBeCloseTo(a.required!, 8);
  });
  it('does not pass mismatched aircraft, incomplete route, or malformed fuel inputs', () => {
    const f = fixture();
    expect(checkRouteFuel(f.route, f.calculation, f.profile, { ...f.flight, callsign: 'WRONG' }).status).toBe('incomplete');
    expect(checkRouteFuel({ ...f.route, cruiseSpeedKt: null }, f.calculation, f.profile, f.flight).status).toBe('incomplete');
    f.calculation.input.stationLoads[0]!.blockVolume = NaN;
    expect(checkRouteFuel(f.route, f.calculation, f.profile, f.flight).status).toBe('incomplete');
  });
  it('uses the saved trip if it exceeds the attached route and flags changed dates', () => {
    const f = fixture(); f.calculation.input.stationLoads[0]!.cruiseMinutes = 180;
    f.calculation.calculationDate = '2026-09-11';
    const r = checkRouteFuel(f.route, f.calculation, f.profile, f.flight);
    expect(r.trip).toBe(63); expect(r.status).toBe('shortfall');
    expect(r.notes.join(' ')).toContain('dated differently');
  });
});
