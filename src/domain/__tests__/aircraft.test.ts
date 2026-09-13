import { exportAircraftProfile, importAircraftProfile, validateAircraftProfile, type AircraftProfile } from '@/domain/aircraft';

export const readyProfile = (): AircraftProfile => ({
  id: 'profile-1', groupId: 'aircraft-1', revision: 1, registration: 'D-TEST', manufacturer: 'Diamond', model: 'DA20', serialNumber: '',
  massUnit: 'KG', armUnit: 'MM', fuelVolumeUnit: 'L', emptyMass: 500, emptyMoment: 150000,
  maxRampMass: 755, maxTakeoffMass: 750, maxLandingMass: 750, maxZeroFuelMass: 720, fuelDensity: 0.72,
  sourceReference: 'Approved AFM section 6', sourceDate: '2026-09-07', status: 'READY',
  stations: [
    { id: 'seats', name: 'Front seats', type: 'OCCUPANT', method: 'FIXED_ARM', arm: 400, maxMass: 220, maxVolume: null, momentPoints: [], sortOrder: 0 },
    { id: 'bag', name: 'Baggage', type: 'BAGGAGE', method: 'FIXED_ARM', arm: 600, maxMass: 20, maxVolume: null, momentPoints: [], sortOrder: 1 },
    { id: 'fuel', name: 'Fuel', type: 'FUEL', method: 'FIXED_ARM', arm: 500, maxMass: null, maxVolume: 75, momentPoints: [], sortOrder: 2 }
  ],
  envelope: [
    { side: 'FORWARD', mass: 500, arm: 250, sortOrder: 0 }, { side: 'FORWARD', mass: 750, arm: 280, sortOrder: 1 },
    { side: 'AFT', mass: 500, arm: 650, sortOrder: 0 }, { side: 'AFT', mass: 750, arm: 650, sortOrder: 1 }
  ],
  createdAt: 1, updatedAt: 1
});

describe('aircraft profiles', () => {
  it('requires numerical data before a profile can become Ready', () => {
    const profile = readyProfile();
    expect(validateAircraftProfile(profile)).toEqual({ ready: true, errors: [] });
    expect(validateAircraftProfile({ ...profile, sourceReference: '', envelope: [] }).ready).toBe(false);
  });

  it('accepts an approved envelope that begins above empty mass', () => {
    const profile = readyProfile();
    const result = validateAircraftProfile({
      ...profile,
      emptyMass: 523,
      maxTakeoffMass: 730,
      envelope: [
        { side: 'FORWARD', mass: 560, arm: 250, sortOrder: 0 },
        { side: 'FORWARD', mass: 730, arm: 250, sortOrder: 1 },
        { side: 'AFT', mass: 560, arm: 390, sortOrder: 0 },
        { side: 'AFT', mass: 730, arm: 390, sortOrder: 1 }
      ]
    });
    expect(result).toEqual({ ready: true, errors: [] });
  });

  it('still requires the envelope to cover maximum takeoff mass', () => {
    const profile = readyProfile();
    const result = validateAircraftProfile({
      ...profile,
      envelope: profile.envelope.map((point) => ({ ...point, mass: point.mass === 750 ? 700 : point.mass }))
    });
    expect(result.ready).toBe(false);
    expect(result.errors).toContain('The envelope must cover maximum takeoff mass.');
  });

  it('exports and imports a portable draft without database identity', () => {
    const profile = readyProfile();
    const imported = importAircraftProfile(exportAircraftProfile(profile));
    expect(imported.registration).toBe('D-TEST');
    expect(imported.status).toBe('DRAFT');
    expect(imported.stations).toHaveLength(3);
    expect((imported as { id?: string }).id).toBeUndefined();
  });
});
