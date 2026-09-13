import type { SQLiteDatabase } from 'expo-sqlite';
import type { AircraftEnvelopePoint, AircraftProfile, AircraftProfileInput, AircraftProfileStatus, AircraftStation, AircraftStationMethod, AircraftStationType, EnvelopeSide } from '@/domain/aircraft';
import { validateAircraftProfile } from '@/domain/aircraft';

interface ProfileRow {
  id: string; group_id: string; revision: number; registration: string; manufacturer: string; model: string; serial_number: string;
  mass_unit: AircraftProfile['massUnit']; arm_unit: AircraftProfile['armUnit']; fuel_volume_unit: AircraftProfile['fuelVolumeUnit'];
  empty_mass: number; empty_moment: number; max_ramp_mass: number | null; max_takeoff_mass: number; max_landing_mass: number | null;
  max_zero_fuel_mass: number | null; fuel_density: number | null; source_reference: string; source_date: string;
  status: AircraftProfileStatus; created_at: number; updated_at: number;
}

interface StationRow { id: string; profile_id: string; name: string; type: AircraftStationType; method: AircraftStationMethod; arm: number | null; max_mass: number | null; max_volume: number | null; sort_order: number; }
interface MomentRow { station_id: string; mass: number; moment: number; sort_order: number; }
interface EnvelopeRow { profile_id: string; side: EnvelopeSide; mass: number; arm: number; sort_order: number; }

async function hydrate(db: SQLiteDatabase, rows: ProfileRow[]): Promise<AircraftProfile[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => '?').join(',');
  const stations = await db.getAllAsync<StationRow>(`SELECT * FROM aircraft_stations WHERE profile_id IN (${placeholders}) ORDER BY sort_order`, ...ids);
  const stationIds = stations.map((row) => row.id);
  const moments = stationIds.length ? await db.getAllAsync<MomentRow>(`SELECT * FROM aircraft_station_moment_points WHERE station_id IN (${stationIds.map(() => '?').join(',')}) ORDER BY sort_order`, ...stationIds) : [];
  const envelope = await db.getAllAsync<EnvelopeRow>(`SELECT * FROM aircraft_envelope_points WHERE profile_id IN (${placeholders}) ORDER BY side, sort_order`, ...ids);
  return rows.map((row) => ({
    id: row.id, groupId: row.group_id, revision: row.revision, registration: row.registration, manufacturer: row.manufacturer,
    model: row.model, serialNumber: row.serial_number, massUnit: row.mass_unit, armUnit: row.arm_unit,
    fuelVolumeUnit: row.fuel_volume_unit, emptyMass: row.empty_mass, emptyMoment: row.empty_moment,
    maxRampMass: row.max_ramp_mass, maxTakeoffMass: row.max_takeoff_mass, maxLandingMass: row.max_landing_mass,
    maxZeroFuelMass: row.max_zero_fuel_mass, fuelDensity: row.fuel_density, sourceReference: row.source_reference,
    sourceDate: row.source_date, status: row.status,
    stations: stations.filter((station) => station.profile_id === row.id).map((station): AircraftStation => ({
      id: station.id, name: station.name, type: station.type, method: station.method, arm: station.arm,
      maxMass: station.max_mass, maxVolume: station.max_volume, sortOrder: station.sort_order,
      momentPoints: moments.filter((point) => point.station_id === station.id).map((point) => ({ mass: point.mass, moment: point.moment }))
    })),
    envelope: envelope.filter((point) => point.profile_id === row.id).map((point): AircraftEnvelopePoint => ({ side: point.side, mass: point.mass, arm: point.arm, sortOrder: point.sort_order })),
    createdAt: row.created_at, updatedAt: row.updated_at
  }));
}

export async function getAircraftProfiles(db: SQLiteDatabase, includeSuperseded = false): Promise<AircraftProfile[]> {
  const rows = await db.getAllAsync<ProfileRow>(`SELECT * FROM aircraft_profiles ${includeSuperseded ? '' : "WHERE status <> 'SUPERSEDED'"} ORDER BY registration, revision DESC`);
  return hydrate(db, rows);
}

export async function getReadyAircraftProfiles(db: SQLiteDatabase): Promise<AircraftProfile[]> {
  const rows = await db.getAllAsync<ProfileRow>("SELECT * FROM aircraft_profiles WHERE status = 'READY' ORDER BY registration");
  return hydrate(db, rows);
}

export async function getAircraftProfile(db: SQLiteDatabase, id: string): Promise<AircraftProfile | null> {
  const row = await db.getFirstAsync<ProfileRow>('SELECT * FROM aircraft_profiles WHERE id = ?', id);
  return row ? (await hydrate(db, [row]))[0]! : null;
}

async function insertProfile(db: SQLiteDatabase, input: AircraftProfileInput, metadata: { id: string; groupId: string; revision: number; status: AircraftProfileStatus; now: number }): Promise<void> {
  const { id, groupId, revision, status, now } = metadata;
  await db.runAsync(`INSERT INTO aircraft_profiles (
    id, group_id, revision, registration, manufacturer, model, serial_number, mass_unit, arm_unit, fuel_volume_unit,
    empty_mass, empty_moment, max_ramp_mass, max_takeoff_mass, max_landing_mass, max_zero_fuel_mass, fuel_density,
    source_reference, source_date, status, created_at, updated_at
  ) VALUES (${Array.from({ length: 22 }, () => '?').join(',')})`,
  id, groupId, revision, input.registration.trim().toUpperCase(), input.manufacturer.trim(), input.model.trim(), input.serialNumber.trim(),
  input.massUnit, input.armUnit, input.fuelVolumeUnit, input.emptyMass, input.emptyMoment, input.maxRampMass, input.maxTakeoffMass,
  input.maxLandingMass, input.maxZeroFuelMass, input.fuelDensity, input.sourceReference.trim(), input.sourceDate.trim(), status, now, now);
  for (const [index, station] of input.stations.entries()) {
    const stationId = `station-${now}-${index}-${Math.random().toString(36).slice(2, 7)}`;
    await db.runAsync('INSERT INTO aircraft_stations (id, profile_id, name, type, method, arm, max_mass, max_volume, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', stationId, id, station.name.trim(), station.type, station.method, station.arm, station.maxMass, station.maxVolume, index);
    for (const [pointIndex, point] of station.momentPoints.entries()) await db.runAsync('INSERT INTO aircraft_station_moment_points (station_id, mass, moment, sort_order) VALUES (?, ?, ?, ?)', stationId, point.mass, point.moment, pointIndex);
  }
  for (const [index, point] of input.envelope.entries()) await db.runAsync('INSERT INTO aircraft_envelope_points (profile_id, side, mass, arm, sort_order) VALUES (?, ?, ?, ?, ?)', id, point.side, point.mass, point.arm, index);
}

export async function saveAircraftProfile(db: SQLiteDatabase, input: AircraftProfileInput, makeReady = false): Promise<string> {
  if (makeReady) {
    const validation = validateAircraftProfile(input);
    if (!validation.ready) throw new Error(validation.errors.join('\n'));
  }
  const now = Date.now();
  const existing = input.id ? await getAircraftProfile(db, input.id) : null;
  const groupId = existing?.groupId ?? input.groupId ?? `aircraft-${now}-${Math.random().toString(36).slice(2, 9)}`;
  const createRevision = Boolean(existing && existing.status !== 'DRAFT');
  const id = !existing || createRevision ? `profile-${now}-${Math.random().toString(36).slice(2, 9)}` : existing.id;
  const latest = createRevision ? await db.getFirstAsync<{ revision: number }>('SELECT MAX(revision) AS revision FROM aircraft_profiles WHERE group_id = ?', groupId) : null;
  const revision = createRevision ? (latest?.revision ?? existing!.revision) + 1 : existing?.revision ?? input.revision ?? 1;
  const status: AircraftProfileStatus = makeReady ? 'READY' : 'DRAFT';
  await db.withTransactionAsync(async () => {
    if (existing && !createRevision) {
      await db.runAsync('DELETE FROM aircraft_profiles WHERE id = ?', existing.id);
    }
    if (makeReady) await db.runAsync("UPDATE aircraft_profiles SET status = 'SUPERSEDED', updated_at = ? WHERE group_id = ? AND status = 'READY'", now, groupId);
    await insertProfile(db, input, { id, groupId, revision, status, now });
  });
  return id;
}

export async function deleteAircraftProfile(db: SQLiteDatabase, id: string): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    const linked = await tx.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM weight_balance_calculations WHERE profile_id = ?', id);
    if ((linked?.count ?? 0) > 0) throw new Error('This profile is retained because saved calculations use it.');
    const planned = await tx.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM planned_flights WHERE aircraft_profile_id = ?', id);
    if ((planned?.count ?? 0) > 0) throw new Error('This profile is used by a planned flight. Change that flight’s aircraft before deleting it.');
    await tx.runAsync('DELETE FROM aircraft_profiles WHERE id = ?', id);
  });
}
