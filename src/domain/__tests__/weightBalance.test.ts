import { readyProfile } from '@/domain/__tests__/aircraft.test';
import { calculateFuelPlan, calculateWeightBalance, envelopeLimit } from '@/domain/weightBalance';

const load = () => ({
  title: 'Local flight', calculationDate: '2026-09-07', stationLoads: [
    { stationId: 'seats', mass: 100, blockVolume: 0, taxiVolume: 0, tripVolume: 0 },
    { stationId: 'bag', mass: 10, blockVolume: 0, taxiVolume: 0, tripVolume: 0 },
    { stationId: 'fuel', mass: 0, blockVolume: 50, taxiVolume: 4, tripVolume: 20 }
  ]
});

describe('mass and balance', () => {
  it('builds a load-sheet-style fuel plan', () => {
    const plan = calculateFuelPlan({
      stationId: 'fuel', mass: 0, blockVolume: 44, taxiVolume: 4, tripVolume: 0,
      cruiseMinutes: 60, fuelFlowPerHour: 20, contingencyPercent: 10,
      approachDepartureVolume: 3, reserveMinutes: 30, extraVolume: 5
    });
    expect(plan).toMatchObject({
      cruiseVolume: 20,
      contingencyVolume: 2,
      reserveVolume: 10,
      airborneVolume: 23,
      minimumVolume: 39,
      totalVolume: 44,
      takeoffVolume: 40,
      landingVolume: 17,
      safeEnduranceMinutes: 102,
      hasPlanningData: true
    });
  });

  it('enforces a 30-minute minimum reserve in planned fuel', () => {
    const plan = calculateFuelPlan({
      stationId: 'fuel', mass: 0, blockVolume: 20, taxiVolume: 0, tripVolume: 0,
      cruiseMinutes: 30, fuelFlowPerHour: 20, reserveMinutes: 5
    });
    expect(plan.reserveVolume).toBe(10);
    expect(plan.minimumVolume).toBe(20);
  });

  it('calculates ramp, takeoff, and landing states', () => {
    const result = calculateWeightBalance(readyProfile(), load());
    expect(result.valid).toBe(true);
    expect(result.states.map((state) => state.name)).toEqual(['RAMP', 'TAKEOFF', 'LANDING']);
    expect(result.states[0]?.mass).toBeCloseTo(646);
    expect(result.states[1]?.mass).toBeCloseTo(643.12);
    expect(result.states[2]?.mass).toBeCloseTo(628.72);
    expect(result.states.every((state) => state.withinEnvelope && state.withinMassLimit)).toBe(true);
  });

  it('rejects impossible fuel and non-Ready profiles', () => {
    const impossible = load();
    impossible.stationLoads[2]!.tripVolume = 60;
    expect(calculateWeightBalance(readyProfile(), impossible).errors[0]).toContain('exceed fuel on board');
    expect(calculateWeightBalance({ ...readyProfile(), status: 'DRAFT' }, load()).valid).toBe(false);
  });

  it('checks a fuel station mass limit as well as its volume limit', () => {
    const profile = readyProfile();
    profile.stations[2] = { ...profile.stations[2]!, maxMass: 20, maxVolume: 75 };
    const result = calculateWeightBalance(profile, load());
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Fuel exceeds its maximum mass.');
  });

  it('warns when fuel on board is below the planned total without changing the mass calculation', () => {
    const planned = load();
    Object.assign(planned.stationLoads[2]!, {
      blockVolume: 30,
      taxiVolume: 4,
      cruiseMinutes: 60,
      fuelFlowPerHour: 20,
      contingencyPercent: 10,
      approachDepartureVolume: 2,
      reserveMinutes: 30,
      extraVolume: 3
    });
    const result = calculateWeightBalance(readyProfile(), planned);
    expect(result.warnings).toEqual(['Fuel: fuel on board is 11.0 L below the planned total fuel load.']);
    expect(result.states.find((state) => state.name === 'RAMP')?.mass).toBeCloseTo(631.6);
    expect(result.states.find((state) => state.name === 'LANDING')?.mass).toBeCloseTo(612.88);
  });

  it('interpolates station moment tables and exact envelope limits', () => {
    const profile = readyProfile();
    profile.stations[0] = { ...profile.stations[0]!, method: 'MOMENT_TABLE', arm: null, momentPoints: [{ mass: 0, moment: 0 }, { mass: 200, moment: 82000 }] };
    const result = calculateWeightBalance(profile, load());
    expect(result.states[0]?.moment).toBeCloseTo(215000);
    expect(envelopeLimit(profile.envelope.filter((point) => point.side === 'FORWARD'), 625)).toBeCloseTo(265);
  });

  it('reports mass and CG limit failures', () => {
    const profile = readyProfile();
    profile.maxTakeoffMass = 620;
    const result = calculateWeightBalance(profile, load());
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('takeoff mass'))).toBe(true);
  });

  it('rejects a calculated loading state below the entered envelope range', () => {
    const profile = readyProfile();
    profile.emptyMass = 523;
    profile.emptyMoment = 173880;
    profile.maxTakeoffMass = 730;
    profile.envelope = [
      { side: 'FORWARD', mass: 560, arm: 250, sortOrder: 0 },
      { side: 'FORWARD', mass: 730, arm: 250, sortOrder: 1 },
      { side: 'AFT', mass: 560, arm: 390, sortOrder: 0 },
      { side: 'AFT', mass: 730, arm: 390, sortOrder: 1 }
    ];
    const emptyLoads = load();
    emptyLoads.stationLoads = emptyLoads.stationLoads.map((item) => ({ ...item, mass: 0, blockVolume: 0, taxiVolume: 0, tripVolume: 0 }));
    const result = calculateWeightBalance(profile, emptyLoads);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('The ramp mass is outside the entered envelope range.');
  });

  it('calculates mass and moment for a synthetic loading example', () => {
    const profile = readyProfile();
    Object.assign(profile, { emptyMass: 531.2, emptyMoment: 155920, maxRampMass: 750, maxTakeoffMass: 750, maxLandingMass: 750, maxZeroFuelMass: 750, fuelDensity: 0.72 });
    profile.stations = [
      { id: 'people', name: 'Pilot and passenger', type: 'OCCUPANT', method: 'FIXED_ARM', arm: 143, maxMass: 218, maxVolume: null, momentPoints: [], sortOrder: 0 },
      { id: 'fuel', name: 'Fuel', type: 'FUEL', method: 'FIXED_ARM', arm: 824, maxMass: null, maxVolume: 74, momentPoints: [], sortOrder: 1 },
      { id: 'baggage', name: 'Baggage', type: 'BAGGAGE', method: 'FIXED_ARM', arm: 824, maxMass: 20, maxVolume: null, momentPoints: [], sortOrder: 2 }
    ];
    profile.envelope = [
      { side: 'FORWARD', mass: 500, arm: 240, sortOrder: 0 }, { side: 'FORWARD', mass: 750, arm: 280, sortOrder: 1 },
      { side: 'AFT', mass: 500, arm: 340, sortOrder: 0 }, { side: 'AFT', mass: 750, arm: 340, sortOrder: 1 }
    ];
    const result = calculateWeightBalance(profile, { title: 'Synthetic example', calculationDate: '2026-09-07', stationLoads: [
      { stationId: 'people', mass: 180, blockVolume: 0, taxiVolume: 0, tripVolume: 0 },
      { stationId: 'fuel', mass: 0, blockVolume: 40, taxiVolume: 4, tripVolume: 20 },
      { stationId: 'baggage', mass: 10, blockVolume: 0, taxiVolume: 0, tripVolume: 0 }
    ] });
    expect(result.states.find((state) => state.name === 'RAMP')?.mass).toBeCloseTo(750);
    expect(result.states.find((state) => state.name === 'RAMP')?.moment).toBeCloseTo(213631.2);
    expect(result.states.find((state) => state.name === 'TAKEOFF')?.mass).toBeCloseTo(747.12);
    expect(result.states.find((state) => state.name === 'LANDING')?.mass).toBeCloseTo(732.72);
  });
});
