export type AircraftMassUnit = 'KG' | 'LB';
export type AircraftArmUnit = 'MM' | 'CM' | 'M' | 'IN';
export type FuelVolumeUnit = 'L' | 'US_GAL';
export type AircraftProfileStatus = 'DRAFT' | 'READY' | 'SUPERSEDED';
export type AircraftStationType = 'OCCUPANT' | 'BAGGAGE' | 'FUEL' | 'OTHER';
export type AircraftStationMethod = 'FIXED_ARM' | 'MOMENT_TABLE';
export type EnvelopeSide = 'FORWARD' | 'AFT';

export interface AircraftMomentPoint {
  mass: number;
  moment: number;
}

export interface AircraftStation {
  id: string;
  name: string;
  type: AircraftStationType;
  method: AircraftStationMethod;
  arm: number | null;
  maxMass: number | null;
  maxVolume: number | null;
  momentPoints: AircraftMomentPoint[];
  sortOrder: number;
}

export interface AircraftEnvelopePoint {
  side: EnvelopeSide;
  mass: number;
  arm: number;
  sortOrder: number;
}

export interface AircraftProfile {
  id: string;
  groupId: string;
  revision: number;
  registration: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  massUnit: AircraftMassUnit;
  armUnit: AircraftArmUnit;
  fuelVolumeUnit: FuelVolumeUnit;
  emptyMass: number;
  emptyMoment: number;
  maxRampMass: number | null;
  maxTakeoffMass: number;
  maxLandingMass: number | null;
  maxZeroFuelMass: number | null;
  fuelDensity: number | null;
  sourceReference: string;
  sourceDate: string;
  status: AircraftProfileStatus;
  stations: AircraftStation[];
  envelope: AircraftEnvelopePoint[];
  createdAt: number;
  updatedAt: number;
}

export type AircraftProfileInput = Omit<AircraftProfile, 'id' | 'groupId' | 'revision' | 'status' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  groupId?: string;
  revision?: number;
  status?: AircraftProfileStatus;
};

export interface AircraftProfileValidation {
  ready: boolean;
  errors: string[];
}

const finitePositive = (value: number | null): value is number => value !== null && Number.isFinite(value) && value > 0;

function sortedSide(profile: Pick<AircraftProfileInput, 'envelope'>, side: EnvelopeSide): AircraftEnvelopePoint[] {
  return profile.envelope.filter((point) => point.side === side).sort((a, b) => a.mass - b.mass || a.sortOrder - b.sortOrder);
}

function interpolate(points: AircraftEnvelopePoint[], mass: number): number | null {
  if (points.length < 2 || mass < points[0]!.mass || mass > points.at(-1)!.mass) return null;
  const exact = points.find((point) => point.mass === mass);
  if (exact) return exact.arm;
  const upperIndex = points.findIndex((point) => point.mass > mass);
  if (upperIndex <= 0) return null;
  const lower = points[upperIndex - 1]!;
  const upper = points[upperIndex]!;
  const ratio = (mass - lower.mass) / (upper.mass - lower.mass);
  return lower.arm + ratio * (upper.arm - lower.arm);
}

export function validateAircraftProfile(profile: AircraftProfileInput): AircraftProfileValidation {
  const errors: string[] = [];
  if (!profile.registration.trim()) errors.push('Registration is required.');
  if (!profile.manufacturer.trim()) errors.push('Manufacturer is required.');
  if (!profile.model.trim()) errors.push('Model is required.');
  if (!profile.sourceReference.trim()) errors.push('An approved source reference is required.');
  if (!finitePositive(profile.emptyMass)) errors.push('Empty mass must be greater than zero.');
  if (!Number.isFinite(profile.emptyMoment)) errors.push('Empty moment is required.');
  if (!finitePositive(profile.maxTakeoffMass)) errors.push('Maximum takeoff mass must be greater than zero.');
  if (finitePositive(profile.emptyMass) && finitePositive(profile.maxTakeoffMass) && profile.emptyMass >= profile.maxTakeoffMass) errors.push('Maximum takeoff mass must exceed empty mass.');
  if (!profile.stations.length) errors.push('At least one loading station is required.');
  const names = new Set<string>();
  for (const station of profile.stations) {
    const name = station.name.trim().toLowerCase();
    if (!name) errors.push('Every loading station needs a name.');
    else if (names.has(name)) errors.push(`Station name “${station.name.trim()}” is duplicated.`);
    names.add(name);
    if (station.method === 'FIXED_ARM' && !finitePositive(station.arm)) errors.push(`${station.name || 'A station'} needs a positive arm.`);
    if (station.method === 'MOMENT_TABLE') {
      const points = [...station.momentPoints].sort((a, b) => a.mass - b.mass);
      if (points.length < 2 || points.some((point) => !Number.isFinite(point.mass) || point.mass < 0 || !Number.isFinite(point.moment))) errors.push(`${station.name || 'A station'} needs at least two valid moment-table points.`);
      if (points.some((point, index) => index > 0 && point.mass <= points[index - 1]!.mass)) errors.push(`${station.name || 'A station'} moment-table masses must increase.`);
    }
    if (station.type === 'FUEL' && !finitePositive(profile.fuelDensity)) errors.push('Fuel density is required when a fuel station is present.');
  }
  const forward = sortedSide(profile, 'FORWARD');
  const aft = sortedSide(profile, 'AFT');
  if (forward.length < 2 || aft.length < 2) errors.push('Enter at least two numerical points for both the forward and aft envelope limits.');
  if (forward.some((point, index) => !finitePositive(point.mass) || !Number.isFinite(point.arm) || (index > 0 && point.mass <= forward[index - 1]!.mass))) errors.push('Forward envelope masses must be valid and increase.');
  if (aft.some((point, index) => !finitePositive(point.mass) || !Number.isFinite(point.arm) || (index > 0 && point.mass <= aft[index - 1]!.mass))) errors.push('Aft envelope masses must be valid and increase.');
  if (finitePositive(profile.maxTakeoffMass) && forward.length >= 2 && aft.length >= 2) {
    const overlapMinimum = Math.max(forward[0]!.mass, aft[0]!.mass);
    const overlapMaximum = Math.min(forward.at(-1)!.mass, aft.at(-1)!.mass);
    if (overlapMinimum > overlapMaximum) errors.push('The forward and aft envelope limits must cover the same mass range.');
    if (interpolate(forward, profile.maxTakeoffMass) === null || interpolate(aft, profile.maxTakeoffMass) === null) errors.push('The envelope must cover maximum takeoff mass.');
    const breakpoints = [...new Set([
      overlapMinimum,
      overlapMaximum,
      profile.maxTakeoffMass,
      ...forward.map((point) => point.mass),
      ...aft.map((point) => point.mass)
    ].filter((mass) => mass >= overlapMinimum && mass <= overlapMaximum))];
    if (breakpoints.some((mass) => {
      const fwd = interpolate(forward, mass);
      const rear = interpolate(aft, mass);
      return fwd !== null && rear !== null && fwd > rear;
    })) errors.push('The forward envelope limit cannot be aft of the aft limit.');
  }
  return { ready: errors.length === 0, errors };
}

export interface AircraftProfileExchange {
  format: 'aerobrief-aircraft-profile';
  version: 1;
  exportedAt: string;
  profile: Omit<AircraftProfileInput, 'id' | 'groupId' | 'revision' | 'status'>;
}

export function exportAircraftProfile(profile: AircraftProfile): string {
  const { id: _id, groupId: _groupId, revision: _revision, status: _status, createdAt: _createdAt, updatedAt: _updatedAt, ...portable } = profile;
  return JSON.stringify({ format: 'aerobrief-aircraft-profile', version: 1, exportedAt: new Date().toISOString(), profile: portable } satisfies AircraftProfileExchange, null, 2);
}

export function importAircraftProfile(value: string): AircraftProfileInput {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error('This is not valid JSON.'); }
  const exchange = parsed as Partial<AircraftProfileExchange>;
  if (exchange.format !== 'aerobrief-aircraft-profile' || exchange.version !== 1 || !exchange.profile || typeof exchange.profile !== 'object') throw new Error('This is not an AeroBrief aircraft profile.');
  const profile = exchange.profile as AircraftProfileInput;
  if (!Array.isArray(profile.stations) || !Array.isArray(profile.envelope)) throw new Error('The aircraft profile is incomplete.');
  return { ...profile, registration: String(profile.registration ?? '').trim().toUpperCase(), status: 'DRAFT' };
}
