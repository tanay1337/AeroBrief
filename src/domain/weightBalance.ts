import type { AircraftEnvelopePoint, AircraftProfile, AircraftStation } from '@/domain/aircraft';

export interface StationLoadInput {
  stationId: string;
  mass: number;
  blockVolume: number;
  taxiVolume: number;
  tripVolume: number;
  cruiseMinutes?: number;
  fuelFlowPerHour?: number;
  contingencyPercent?: number;
  approachDepartureVolume?: number;
  reserveMinutes?: number;
  extraVolume?: number;
}

export interface FuelPlanBreakdown {
  cruiseVolume: number;
  contingencyVolume: number;
  taxiVolume: number;
  approachDepartureVolume: number;
  reserveVolume: number;
  extraVolume: number;
  minimumVolume: number;
  totalVolume: number;
  airborneVolume: number;
  takeoffVolume: number;
  landingVolume: number;
  safeEnduranceMinutes: number;
  hasPlanningData: boolean;
}

export interface WeightBalanceInput {
  title: string;
  calculationDate: string;
  stationLoads: StationLoadInput[];
}

export type WeightBalanceStateName = 'RAMP' | 'TAKEOFF' | 'LANDING';

export interface WeightBalanceStateResult {
  name: WeightBalanceStateName;
  mass: number;
  moment: number;
  arm: number;
  forwardLimit: number;
  aftLimit: number;
  withinEnvelope: boolean;
  withinMassLimit: boolean;
}

export interface WeightBalanceResult {
  valid: boolean;
  states: WeightBalanceStateResult[];
  errors: string[];
  warnings: string[];
}

export interface SavedWeightBalanceCalculation {
  id: string;
  profileId: string;
  profileGroupId: string;
  profileRevision: number;
  registration: string;
  title: string;
  calculationDate: string;
  input: WeightBalanceInput;
  result: WeightBalanceResult;
  logbookFlightId: string | null;
  createdAt: number;
}

function interpolateMoment(station: AircraftStation, mass: number): number {
  if (station.method === 'FIXED_ARM') return mass * station.arm!;
  const points = [...station.momentPoints].sort((a, b) => a.mass - b.mass);
  if (mass < points[0]!.mass || mass > points.at(-1)!.mass) throw new Error(`${station.name} load is outside its moment table.`);
  const exact = points.find((point) => point.mass === mass);
  if (exact) return exact.moment;
  const upperIndex = points.findIndex((point) => point.mass > mass);
  const lower = points[upperIndex - 1]!;
  const upper = points[upperIndex]!;
  return lower.moment + (mass - lower.mass) / (upper.mass - lower.mass) * (upper.moment - lower.moment);
}

export function envelopeLimit(points: AircraftEnvelopePoint[], mass: number): number | null {
  const sorted = [...points].sort((a, b) => a.mass - b.mass || a.sortOrder - b.sortOrder);
  if (sorted.length < 2 || mass < sorted[0]!.mass || mass > sorted.at(-1)!.mass) return null;
  const exact = sorted.find((point) => point.mass === mass);
  if (exact) return exact.arm;
  const upperIndex = sorted.findIndex((point) => point.mass > mass);
  const lower = sorted[upperIndex - 1]!;
  const upper = sorted[upperIndex]!;
  return lower.arm + (mass - lower.mass) / (upper.mass - lower.mass) * (upper.arm - lower.arm);
}

const stateLimit = (profile: AircraftProfile, state: WeightBalanceStateName): number => {
  if (state === 'RAMP') return profile.maxRampMass ?? profile.maxTakeoffMass;
  if (state === 'LANDING') return profile.maxLandingMass ?? profile.maxTakeoffMass;
  return profile.maxTakeoffMass;
};

const nonNegative = (value: number | undefined): number => value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;

export function calculateFuelPlan(load: StationLoadInput): FuelPlanBreakdown {
  const cruiseMinutes = nonNegative(load.cruiseMinutes);
  const fuelFlowPerHour = nonNegative(load.fuelFlowPerHour);
  const contingencyPercent = nonNegative(load.contingencyPercent);
  const taxiVolume = nonNegative(load.taxiVolume);
  const approachDepartureVolume = nonNegative(load.approachDepartureVolume);
  const hasPlanningData = [load.cruiseMinutes, load.fuelFlowPerHour, load.contingencyPercent, load.approachDepartureVolume, load.reserveMinutes, load.extraVolume].some((value) => value !== undefined);
  const reserveMinutes = hasPlanningData ? Math.max(30, nonNegative(load.reserveMinutes)) : 0;
  const extraVolume = nonNegative(load.extraVolume);
  const cruiseVolume = cruiseMinutes / 60 * fuelFlowPerHour;
  const contingencyVolume = cruiseVolume * contingencyPercent / 100;
  const reserveVolume = reserveMinutes / 60 * fuelFlowPerHour;
  const airborneVolume = cruiseVolume + approachDepartureVolume;
  const minimumVolume = airborneVolume + contingencyVolume + taxiVolume + reserveVolume;
  const totalVolume = minimumVolume + extraVolume;
  const enduranceFuel = load.blockVolume > 0 ? load.blockVolume : totalVolume;
  return {
    cruiseVolume,
    contingencyVolume,
    taxiVolume,
    approachDepartureVolume,
    reserveVolume,
    extraVolume,
    minimumVolume,
    totalVolume,
    airborneVolume,
    takeoffVolume: Math.max(0, load.blockVolume - taxiVolume),
    landingVolume: Math.max(0, load.blockVolume - taxiVolume - airborneVolume),
    safeEnduranceMinutes: fuelFlowPerHour > 0 ? Math.max(0, enduranceFuel - reserveVolume) / fuelFlowPerHour * 60 : 0,
    hasPlanningData
  };
}

export function calculateWeightBalance(profile: AircraftProfile, input: WeightBalanceInput): WeightBalanceResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (profile.status !== 'READY') return { valid: false, states: [], errors: ['This aircraft profile is not Ready.'], warnings };
  const loads = new Map(input.stationLoads.map((load) => [load.stationId, load]));
  let baseMass = profile.emptyMass;
  let baseMoment = profile.emptyMoment;
  const fuelByState: Record<'RAMP' | 'TAKEOFF' | 'LANDING', { mass: number; moment: number }> = {
    RAMP: { mass: 0, moment: 0 }, TAKEOFF: { mass: 0, moment: 0 }, LANDING: { mass: 0, moment: 0 }
  };
  for (const station of profile.stations) {
    const load = loads.get(station.id) ?? { stationId: station.id, mass: 0, blockVolume: 0, taxiVolume: 0, tripVolume: 0 };
    const values = [load.mass, load.blockVolume, load.taxiVolume, load.tripVolume, load.cruiseMinutes, load.fuelFlowPerHour, load.contingencyPercent, load.approachDepartureVolume, load.reserveMinutes, load.extraVolume].filter((value): value is number => value !== undefined);
    if (values.some((value) => !Number.isFinite(value) || value < 0)) { errors.push(`${station.name} contains an invalid load.`); continue; }
    if (station.type !== 'FUEL') {
      if (station.maxMass !== null && load.mass > station.maxMass) errors.push(`${station.name} exceeds its maximum load.`);
      try { baseMass += load.mass; baseMoment += interpolateMoment(station, load.mass); } catch (error) { errors.push(error instanceof Error ? error.message : `${station.name} could not be calculated.`); }
      continue;
    }
    const plan = calculateFuelPlan(load);
    const airborneVolume = plan.hasPlanningData ? plan.airborneVolume : load.tripVolume;
    const density = profile.fuelDensity!;
    if (station.maxVolume !== null && load.blockVolume > station.maxVolume) errors.push(`${station.name} exceeds its maximum volume.`);
    if (station.maxMass !== null && load.blockVolume * density > station.maxMass) errors.push(`${station.name} exceeds its maximum mass.`);
    if (load.taxiVolume + airborneVolume > load.blockVolume) errors.push(`${station.name} start, taxi, and airborne fuel exceed fuel on board.`);
    if (plan.hasPlanningData && load.blockVolume < plan.totalVolume) warnings.push(`${station.name}: fuel on board is ${Math.max(0, plan.totalVolume - load.blockVolume).toFixed(1)} ${profile.fuelVolumeUnit} below the planned total fuel load.`);
    const volumes = { RAMP: load.blockVolume, TAKEOFF: load.blockVolume - load.taxiVolume, LANDING: load.blockVolume - load.taxiVolume - airborneVolume };
    for (const state of ['RAMP', 'TAKEOFF', 'LANDING'] as const) {
      const mass = Math.max(0, volumes[state]) * density;
      fuelByState[state].mass += mass;
      try { fuelByState[state].moment += interpolateMoment(station, mass); } catch (error) { errors.push(error instanceof Error ? error.message : `${station.name} could not be calculated.`); }
    }
  }
  if (errors.length) return { valid: false, states: [], errors: [...new Set(errors)], warnings };
  const definitions: { name: WeightBalanceStateName; mass: number; moment: number }[] = [
    { name: 'RAMP', mass: baseMass + fuelByState.RAMP.mass, moment: baseMoment + fuelByState.RAMP.moment },
    { name: 'TAKEOFF', mass: baseMass + fuelByState.TAKEOFF.mass, moment: baseMoment + fuelByState.TAKEOFF.moment },
    { name: 'LANDING', mass: baseMass + fuelByState.LANDING.mass, moment: baseMoment + fuelByState.LANDING.moment }
  ];
  const forward = profile.envelope.filter((point) => point.side === 'FORWARD');
  const aft = profile.envelope.filter((point) => point.side === 'AFT');
  const states = definitions.flatMap(({ name, mass, moment }): WeightBalanceStateResult[] => {
    const arm = moment / mass;
    const forwardLimit = envelopeLimit(forward, mass);
    const aftLimit = envelopeLimit(aft, mass);
    if (forwardLimit === null || aftLimit === null) {
      errors.push(`The ${name.toLowerCase().replace('_', ' ')} mass is outside the entered envelope range.`);
      return [];
    }
    const withinEnvelope = arm >= forwardLimit && arm <= aftLimit;
    const withinMassLimit = mass <= stateLimit(profile, name);
    if (!withinEnvelope) errors.push(`${name.toLowerCase().replace('_', ' ')} CG is outside the envelope.`);
    if (!withinMassLimit) errors.push(`${name.toLowerCase().replace('_', ' ')} mass exceeds its limit.`);
    return [{ name, mass, moment, arm, forwardLimit, aftLimit, withinEnvelope, withinMassLimit }];
  });
  return { valid: errors.length === 0, states, errors, warnings };
}
