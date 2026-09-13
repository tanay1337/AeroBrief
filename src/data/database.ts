import type { SQLiteDatabase } from 'expo-sqlite';
import type { Airport, AirportFrequency, NearbyAirport, Runway, WeatherBundle } from '@/domain/models';

interface AirportRow {
  id: number;
  ident: string;
  weather_code: string | null;
  iata_code: string | null;
  name: string;
  municipality: string | null;
  country_code: string;
  region_code: string;
  type: string;
  latitude: number;
  longitude: number;
  elevation_ft: number | null;
}

interface RunwayRow {
  id: number;
  airport_id: number;
  length_ft: number | null;
  width_ft: number | null;
  surface: string | null;
  lighted: number;
  closed: number;
  low_ident: string | null;
  low_heading_true: number | null;
  high_ident: string | null;
  high_heading_true: number | null;
}

interface FrequencyRow {
  id: number;
  airport_id: number;
  type: string;
  description: string | null;
  frequency_mhz: number;
}

interface CacheRow {
  icao: string;
  payload: string;
  fetched_at: number;
}

const airportFromRow = (row: AirportRow): Airport => ({
  id: row.id,
  ident: row.ident,
  weatherCode: row.weather_code,
  iataCode: row.iata_code,
  name: row.name,
  municipality: row.municipality,
  countryCode: row.country_code,
  regionCode: row.region_code,
  type: row.type,
  latitude: row.latitude,
  longitude: row.longitude,
  elevationFt: row.elevation_ft
});

export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS favorites (
      airport_id INTEGER PRIMARY KEY,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (airport_id) REFERENCES airports(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS weather_cache (
      icao TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recent_airports (
      airport_id INTEGER PRIMARY KEY,
      viewed_at INTEGER NOT NULL,
      FOREIGN KEY (airport_id) REFERENCES airports(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS logbook_flights (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      aircraft_type TEXT NOT NULL DEFAULT '',
      callsign TEXT NOT NULL DEFAULT '',
      crew TEXT NOT NULL DEFAULT '',
      pic_name TEXT NOT NULL DEFAULT '',
      pilot_role TEXT NOT NULL DEFAULT 'UNASSIGNED',
      departure_airport TEXT NOT NULL DEFAULT '',
      arrival_airport TEXT NOT NULL DEFAULT '',
      departure_time TEXT NOT NULL DEFAULT '',
      landing_time TEXT NOT NULL DEFAULT '',
      block_off_time TEXT NOT NULL DEFAULT '',
      block_on_time TEXT NOT NULL DEFAULT '',
      landings_total INTEGER NOT NULL DEFAULT 0,
      landings_day INTEGER,
      landings_night INTEGER,
      airtime_minutes INTEGER NOT NULL DEFAULT 0,
      flight_time_minutes INTEGER NOT NULL DEFAULT 0,
      pic_minutes INTEGER NOT NULL DEFAULT 0,
      dual_minutes INTEGER NOT NULL DEFAULT 0,
      instructor_minutes INTEGER NOT NULL DEFAULT 0,
      night_minutes INTEGER NOT NULL DEFAULT 0,
      ifr_minutes INTEGER NOT NULL DEFAULT 0,
      price_category TEXT NOT NULL DEFAULT '',
      remarks TEXT NOT NULL DEFAULT '',
      track TEXT NOT NULL DEFAULT '',
      capzlog TEXT NOT NULL DEFAULT '',
      cloudlog TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      source_row INTEGER,
      source_fingerprint TEXT NOT NULL DEFAULT '',
      needs_review INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'COMPLETE',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS logbook_attachments (
      id TEXT PRIMARY KEY,
      flight_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT '',
      uri TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'GENERAL',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (flight_id) REFERENCES logbook_flights(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS logbook_change_history (
      id TEXT PRIMARY KEY,
      flight_id TEXT NOT NULL,
      changed_at INTEGER NOT NULL,
      source TEXT NOT NULL,
      changes_json TEXT NOT NULL,
      FOREIGN KEY (flight_id) REFERENCES logbook_flights(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS logbook_weather_briefings (
      flight_id TEXT PRIMARY KEY,
      departure_airport TEXT NOT NULL,
      arrival_airport TEXT NOT NULL,
      generated_at INTEGER NOT NULL,
      payload TEXT NOT NULL,
      FOREIGN KEY (flight_id) REFERENCES logbook_flights(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS pilot_documents (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      document_number TEXT NOT NULL DEFAULT '',
      issuer TEXT NOT NULL DEFAULT '',
      issue_date TEXT NOT NULL DEFAULT '',
      expiry_date TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pilot_document_files (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT '',
      uri TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (document_id) REFERENCES pilot_documents(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS aircraft_profiles (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      registration TEXT NOT NULL,
      manufacturer TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      serial_number TEXT NOT NULL DEFAULT '',
      mass_unit TEXT NOT NULL DEFAULT 'KG',
      arm_unit TEXT NOT NULL DEFAULT 'MM',
      fuel_volume_unit TEXT NOT NULL DEFAULT 'L',
      empty_mass REAL NOT NULL DEFAULT 0,
      empty_moment REAL NOT NULL DEFAULT 0,
      max_ramp_mass REAL,
      max_takeoff_mass REAL NOT NULL DEFAULT 0,
      max_landing_mass REAL,
      max_zero_fuel_mass REAL,
      fuel_density REAL,
      source_reference TEXT NOT NULL DEFAULT '',
      source_date TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'DRAFT',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(group_id, revision)
    );
    CREATE TABLE IF NOT EXISTS aircraft_stations (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      method TEXT NOT NULL,
      arm REAL,
      max_mass REAL,
      max_volume REAL,
      sort_order INTEGER NOT NULL,
      FOREIGN KEY (profile_id) REFERENCES aircraft_profiles(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS aircraft_station_moment_points (
      station_id TEXT NOT NULL,
      mass REAL NOT NULL,
      moment REAL NOT NULL,
      sort_order INTEGER NOT NULL,
      PRIMARY KEY (station_id, sort_order),
      FOREIGN KEY (station_id) REFERENCES aircraft_stations(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS aircraft_envelope_points (
      profile_id TEXT NOT NULL,
      side TEXT NOT NULL,
      mass REAL NOT NULL,
      arm REAL NOT NULL,
      sort_order INTEGER NOT NULL,
      PRIMARY KEY (profile_id, side, sort_order),
      FOREIGN KEY (profile_id) REFERENCES aircraft_profiles(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS weight_balance_calculations (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      profile_group_id TEXT NOT NULL,
      profile_revision INTEGER NOT NULL,
      registration TEXT NOT NULL,
      title TEXT NOT NULL,
      calculation_date TEXT NOT NULL,
      input_json TEXT NOT NULL,
      result_json TEXT NOT NULL,
      logbook_flight_id TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (profile_id) REFERENCES aircraft_profiles(id),
      FOREIGN KEY (logbook_flight_id) REFERENCES logbook_flights(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS route_plans (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      waypoints_json TEXT NOT NULL,
      cruise_speed_kt REAL,
      fuel_burn_per_hour REAL,
      fuel_unit TEXT NOT NULL DEFAULT 'L',
      wind_direction_true REAL,
      wind_speed_kt REAL,
      wind_source TEXT,
      wind_station TEXT,
      wind_station_distance_km REAL,
      wind_observed_at INTEGER,
      airac_cycle TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS planned_flights (
      id TEXT PRIMARY KEY,
      route_plan_id TEXT,
      departure_airport TEXT NOT NULL,
      arrival_airport TEXT NOT NULL,
      departure_date TEXT NOT NULL,
      departure_time TEXT NOT NULL DEFAULT '',
      aircraft_profile_id TEXT,
      weight_balance_id TEXT,
      local_area INTEGER NOT NULL DEFAULT 0,
      logbook_flight_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (route_plan_id) REFERENCES route_plans(id) ON DELETE SET NULL,
      FOREIGN KEY (logbook_flight_id) REFERENCES logbook_flights(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS route_edit_ownership (
      route_id TEXT PRIMARY KEY,
      flight_id TEXT NOT NULL,
      FOREIGN KEY (route_id) REFERENCES route_plans(id) ON DELETE CASCADE,
      FOREIGN KEY (flight_id) REFERENCES planned_flights(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS planned_flight_attachments (
      id TEXT PRIMARY KEY, flight_id TEXT NOT NULL, name TEXT NOT NULL,
      mime_type TEXT NOT NULL, uri TEXT NOT NULL, size_bytes INTEGER NOT NULL,
      category TEXT NOT NULL DEFAULT 'NOTAM_BRIEFING', created_at INTEGER NOT NULL, airport_ident TEXT,
      FOREIGN KEY (flight_id) REFERENCES planned_flights(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS planned_weather_briefings (
      flight_id TEXT PRIMARY KEY, payload TEXT NOT NULL,
      FOREIGN KEY (flight_id) REFERENCES planned_flights(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS logbook_route_snapshots (
      flight_id TEXT PRIMARY KEY,
      source_route_plan_id TEXT,
      attached_at INTEGER NOT NULL,
      payload TEXT NOT NULL,
      FOREIGN KEY (flight_id) REFERENCES logbook_flights(id) ON DELETE CASCADE,
      FOREIGN KEY (source_route_plan_id) REFERENCES route_plans(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_favorites_created_at ON favorites(created_at);
    CREATE INDEX IF NOT EXISTS idx_recent_airports_viewed_at ON recent_airports(viewed_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_logbook_source_fingerprint ON logbook_flights(source_fingerprint) WHERE source_fingerprint <> '';
    CREATE INDEX IF NOT EXISTS idx_logbook_date ON logbook_flights(date DESC);
    CREATE INDEX IF NOT EXISTS idx_logbook_attachments_flight ON logbook_attachments(flight_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_logbook_change_history_flight ON logbook_change_history(flight_id, changed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_logbook_weather_generated ON logbook_weather_briefings(generated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_pilot_documents_expiry ON pilot_documents(expiry_date);
    CREATE INDEX IF NOT EXISTS idx_pilot_document_files_document ON pilot_document_files(document_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_aircraft_profiles_registration ON aircraft_profiles(registration, revision DESC);
    CREATE INDEX IF NOT EXISTS idx_aircraft_profiles_group ON aircraft_profiles(group_id, revision DESC);
    CREATE INDEX IF NOT EXISTS idx_aircraft_stations_profile ON aircraft_stations(profile_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_aircraft_envelope_profile ON aircraft_envelope_points(profile_id, side, sort_order);
    CREATE INDEX IF NOT EXISTS idx_weight_balance_created ON weight_balance_calculations(created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_weight_balance_logbook_flight ON weight_balance_calculations(logbook_flight_id) WHERE logbook_flight_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_route_plans_updated ON route_plans(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_planned_flights_date ON planned_flights(departure_date DESC, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_logbook_route_source ON logbook_route_snapshots(source_route_plan_id);
  `);
  if (typeof db.getAllAsync === 'function') {
    const plannedAttachmentColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(planned_flight_attachments)');
    if (!plannedAttachmentColumns.some((column) => column.name === 'airport_ident')) {
      await db.execAsync('ALTER TABLE planned_flight_attachments ADD COLUMN airport_ident TEXT;');
    }
    const plannedColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(planned_flights)');
    if (!plannedColumns.some((column) => column.name === 'planning_status')) {
      await db.execAsync("ALTER TABLE planned_flights ADD COLUMN planning_status TEXT NOT NULL DEFAULT 'DRAFT';");
    }
    const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(logbook_flights)');
    if (!columns.some((column) => column.name === 'status')) {
      await db.execAsync("ALTER TABLE logbook_flights ADD COLUMN status TEXT NOT NULL DEFAULT 'COMPLETE';");
    }
    const attachmentColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(logbook_attachments)');
    if (!attachmentColumns.some((column) => column.name === 'category')) {
      await db.execAsync("ALTER TABLE logbook_attachments ADD COLUMN category TEXT NOT NULL DEFAULT 'GENERAL';");
    }
    if (!attachmentColumns.some((column) => column.name === 'source_planned_attachment_id')) {
      await db.execAsync('ALTER TABLE logbook_attachments ADD COLUMN source_planned_attachment_id TEXT;');
    }
    await db.execAsync('CREATE UNIQUE INDEX IF NOT EXISTS idx_logbook_planned_attachment ON logbook_attachments(flight_id, source_planned_attachment_id);');
    const routePlanColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(route_plans)');
    if (!routePlanColumns.some((column) => column.name === 'wind_direction_true')) {
      await db.execAsync('ALTER TABLE route_plans ADD COLUMN wind_direction_true REAL;');
    }
    if (!routePlanColumns.some((column) => column.name === 'wind_speed_kt')) {
      await db.execAsync('ALTER TABLE route_plans ADD COLUMN wind_speed_kt REAL;');
    }
    if (!routePlanColumns.some((column) => column.name === 'wind_source')) {
      await db.execAsync('ALTER TABLE route_plans ADD COLUMN wind_source TEXT;');
    }
    if (!routePlanColumns.some((column) => column.name === 'wind_station')) {
      await db.execAsync('ALTER TABLE route_plans ADD COLUMN wind_station TEXT;');
    }
    if (!routePlanColumns.some((column) => column.name === 'wind_station_distance_km')) {
      await db.execAsync('ALTER TABLE route_plans ADD COLUMN wind_station_distance_km REAL;');
    }
    if (!routePlanColumns.some((column) => column.name === 'wind_observed_at')) {
      await db.execAsync('ALTER TABLE route_plans ADD COLUMN wind_observed_at INTEGER;');
    }
  }
}

export async function getAirportsNearCoordinate(
  db: SQLiteDatabase,
  latitude: number,
  longitude: number,
  options: { radiusKm?: number; limit?: number; weatherStationsOnly?: boolean } = {}
): Promise<NearbyAirport[]> {
  const radiusKm = options.radiusKm ?? 12;
  const limit = options.limit ?? 8;
  const latitudeDelta = radiusKm / 111;
  const longitudeScale = Math.max(Math.cos(radians(latitude)), 0.15);
  const longitudeDelta = radiusKm / (111 * longitudeScale);
  const weatherClause = options.weatherStationsOnly ? "AND weather_code IS NOT NULL AND weather_code <> ''" : '';
  const rows = await db.getAllAsync<AirportRow>(
    `SELECT * FROM airports
     WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?
       AND type IN ('small_airport', 'medium_airport', 'large_airport', 'heliport', 'seaplane_base')
       ${weatherClause}
     LIMIT 500`,
    latitude - latitudeDelta,
    latitude + latitudeDelta,
    longitude - longitudeDelta,
    longitude + longitudeDelta
  );
  const origin = { latitude, longitude } as Airport;
  return rows.map(airportFromRow)
    .map((airport) => ({ airport, distanceKm: distanceKm(origin, airport) }))
    .filter((candidate) => candidate.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

const radians = (degrees: number): number => degrees * Math.PI / 180;

function distanceKm(from: Airport, to: Airport): number {
  const earthRadiusKm = 6371;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function getNearbyAirports(
  db: SQLiteDatabase,
  origin: Airport,
  options: { radiusKm?: number; limit?: number; weatherStationsOnly?: boolean } = {}
): Promise<NearbyAirport[]> {
  const radiusKm = options.radiusKm ?? 100;
  const limit = options.limit ?? 12;
  const latitudeDelta = radiusKm / 111;
  const longitudeScale = Math.max(Math.cos(radians(origin.latitude)), 0.15);
  const longitudeDelta = radiusKm / (111 * longitudeScale);
  const weatherClause = options.weatherStationsOnly
    ? "AND weather_code IS NOT NULL AND weather_code <> ''"
    : '';
  const rows = await db.getAllAsync<AirportRow>(
    `SELECT * FROM airports
     WHERE id <> ?
       AND latitude BETWEEN ? AND ?
       AND longitude BETWEEN ? AND ?
       AND type IN ('small_airport', 'medium_airport', 'large_airport')
       ${weatherClause}
     LIMIT 500`,
    origin.id,
    origin.latitude - latitudeDelta,
    origin.latitude + latitudeDelta,
    origin.longitude - longitudeDelta,
    origin.longitude + longitudeDelta
  );
  return rows
    .map(airportFromRow)
    .map((airport) => ({ airport, distanceKm: distanceKm(origin, airport) }))
    .filter((candidate) => candidate.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

export async function recordRecentAirport(db: SQLiteDatabase, airportId: number): Promise<void> {
  await db.runAsync(
    `INSERT INTO recent_airports (airport_id, viewed_at) VALUES (?, ?)
     ON CONFLICT(airport_id) DO UPDATE SET viewed_at = excluded.viewed_at`,
    airportId,
    Date.now()
  );
}

export async function getMostRecentAirport(db: SQLiteDatabase): Promise<Airport | null> {
  const row = await db.getFirstAsync<AirportRow>(
    `SELECT airports.* FROM recent_airports
     JOIN airports ON airports.id = recent_airports.airport_id
     ORDER BY recent_airports.viewed_at DESC
     LIMIT 1`
  );
  return row ? airportFromRow(row) : null;
}

export async function searchAirports(
  db: SQLiteDatabase,
  input: string,
  limit = 50
): Promise<Airport[]> {
  const query = input.trim().toUpperCase();
  if (query.length === 0) {
    const featured = ['KJFK', 'KLAX', 'EGLL', 'EDDF', 'EHAM', 'LFPG', 'YSSY', 'RJTT'];
    const placeholders = featured.map(() => '?').join(',');
    const rows = await db.getAllAsync<AirportRow>(
      `SELECT * FROM airports WHERE weather_code IN (${placeholders})
       ORDER BY CASE weather_code ${featured.map((code, index) => `WHEN '${code}' THEN ${index}`).join(' ')} END`,
      ...featured
    );
    return rows.map(airportFromRow);
  }
  const prefix = `${query}%`;
  const contains = `%${query}%`;
  const rows = await db.getAllAsync<AirportRow>(
    `SELECT * FROM airports
     WHERE ident LIKE ? COLLATE NOCASE
        OR weather_code LIKE ? COLLATE NOCASE
        OR iata_code LIKE ? COLLATE NOCASE
        OR name LIKE ? COLLATE NOCASE
        OR municipality LIKE ? COLLATE NOCASE
     ORDER BY
       CASE
         WHEN weather_code = ? OR ident = ? OR iata_code = ? THEN 0
         WHEN weather_code LIKE ? OR ident LIKE ? OR iata_code LIKE ? THEN 1
         WHEN name LIKE ? THEN 2
         ELSE 3
       END,
       name
     LIMIT ?`,
    prefix,
    prefix,
    prefix,
    contains,
    contains,
    query,
    query,
    query,
    prefix,
    prefix,
    prefix,
    prefix,
    limit
  );
  return rows.map(airportFromRow);
}

export async function getAirport(db: SQLiteDatabase, ident: string): Promise<Airport | null> {
  const row = await db.getFirstAsync<AirportRow>(
    `SELECT * FROM airports
     WHERE ident = ? COLLATE NOCASE OR weather_code = ? COLLATE NOCASE
     ORDER BY CASE WHEN weather_code = ? THEN 0 ELSE 1 END
     LIMIT 1`,
    ident,
    ident,
    ident.toUpperCase()
  );
  return row ? airportFromRow(row) : null;
}

export async function getRunways(db: SQLiteDatabase, airportId: number): Promise<Runway[]> {
  const rows = await db.getAllAsync<RunwayRow>(
    'SELECT * FROM runways WHERE airport_id = ? AND closed = 0 ORDER BY length_ft DESC',
    airportId
  );
  return rows.map((row) => ({
    id: row.id,
    airportId: row.airport_id,
    lengthFt: row.length_ft,
    widthFt: row.width_ft,
    surface: row.surface,
    lighted: row.lighted === 1,
    closed: row.closed === 1,
    lowIdent: row.low_ident,
    lowHeadingTrue: row.low_heading_true,
    highIdent: row.high_ident,
    highHeadingTrue: row.high_heading_true
  }));
}

export async function getFrequencies(db: SQLiteDatabase, airportId: number): Promise<AirportFrequency[]> {
  const rows = await db.getAllAsync<FrequencyRow>(
    'SELECT * FROM frequencies WHERE airport_id = ? ORDER BY frequency_mhz, type',
    airportId
  );
  return rows.map((row) => ({
    id: row.id,
    airportId: row.airport_id,
    type: row.type,
    description: row.description,
    frequencyMhz: row.frequency_mhz
  }));
}

export async function getFavorites(db: SQLiteDatabase): Promise<Airport[]> {
  const rows = await db.getAllAsync<AirportRow>(
    `SELECT airports.* FROM favorites
     JOIN airports ON airports.id = favorites.airport_id
     ORDER BY airports.ident COLLATE NOCASE`
  );
  return rows.map(airportFromRow);
}

export async function isFavorite(db: SQLiteDatabase, airportId: number): Promise<boolean> {
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM favorites WHERE airport_id = ?',
    airportId
  );
  return (row?.count ?? 0) > 0;
}

export async function setFavorite(
  db: SQLiteDatabase,
  airportId: number,
  favorite: boolean
): Promise<void> {
  if (favorite) {
    await db.runAsync(
      'INSERT OR IGNORE INTO favorites (airport_id, created_at) VALUES (?, ?)',
      airportId,
      Date.now()
    );
  } else {
    await db.runAsync('DELETE FROM favorites WHERE airport_id = ?', airportId);
  }
}

export async function getWeatherCaches(
  db: SQLiteDatabase,
  icaos: string[]
): Promise<Map<string, WeatherBundle>> {
  if (icaos.length === 0) return new Map();
  const placeholders = icaos.map(() => '?').join(',');
  const rows = await db.getAllAsync<CacheRow>(
    `SELECT icao, payload, fetched_at FROM weather_cache WHERE icao IN (${placeholders})`,
    ...icaos
  );
  const result = new Map<string, WeatherBundle>();
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload) as WeatherBundle;
      result.set(row.icao, { ...payload, fetchedAt: row.fetched_at });
    } catch {
      // Ignore invalid cache rows. A network refresh will repair them.
    }
  }
  return result;
}

export async function saveWeatherCache(db: SQLiteDatabase, bundle: WeatherBundle): Promise<void> {
  await db.runAsync(
    `INSERT INTO weather_cache (icao, payload, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(icao) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
    bundle.icao,
    JSON.stringify({ ...bundle, isStale: false, refreshError: undefined }),
    bundle.fetchedAt
  );
}

export async function getDataSourceDate(db: SQLiteDatabase): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM metadata WHERE key = 'source_date'"
  );
  return row?.value ?? null;
}
