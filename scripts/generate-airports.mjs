import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parse } from 'csv-parse/sync';

const [airportsPath, runwaysPath, requestedOutput, frequenciesPath] = process.argv.slice(2);
if (!airportsPath || !runwaysPath) {
  console.error('Usage: npm run generate:airports -- airports.csv runways.csv [output.db] [airport-frequencies.csv]');
  process.exit(1);
}

const outputPath = resolve(requestedOutput ?? 'assets/airports.db');
mkdirSync(dirname(outputPath), { recursive: true });
rmSync(outputPath, { force: true });

const parseCsv = (path) => parse(readFileSync(path), {
  columns: true,
  skip_empty_lines: true,
  relax_column_count: true,
  bom: true
});
const nullable = (value) => value === undefined || value === null || value === '' ? null : value;
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const heading = (value) => {
  const parsed = number(value);
  return parsed !== null && parsed >= 0 && parsed <= 360 ? parsed : null;
};
const integer = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const airportRows = parseCsv(airportsPath);
const runwayRows = parseCsv(runwaysPath);
const frequencyRows = frequenciesPath ? parseCsv(frequenciesPath) : [];
const db = new DatabaseSync(outputPath);

db.exec(`
  PRAGMA journal_mode = DELETE;
  PRAGMA synchronous = OFF;
  CREATE TABLE airports (
    id INTEGER PRIMARY KEY,
    ident TEXT NOT NULL UNIQUE,
    weather_code TEXT,
    iata_code TEXT,
    name TEXT NOT NULL,
    municipality TEXT,
    country_code TEXT NOT NULL,
    region_code TEXT NOT NULL,
    type TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    elevation_ft INTEGER
  );
  CREATE TABLE runways (
    id INTEGER PRIMARY KEY,
    airport_id INTEGER NOT NULL,
    length_ft INTEGER,
    width_ft INTEGER,
    surface TEXT,
    lighted INTEGER NOT NULL DEFAULT 0,
    closed INTEGER NOT NULL DEFAULT 0,
    low_ident TEXT,
    low_heading_true REAL,
    high_ident TEXT,
    high_heading_true REAL,
    FOREIGN KEY (airport_id) REFERENCES airports(id) ON DELETE CASCADE
  );
  CREATE TABLE frequencies (
    id INTEGER PRIMARY KEY,
    airport_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    frequency_mhz REAL NOT NULL,
    FOREIGN KEY (airport_id) REFERENCES airports(id) ON DELETE CASCADE
  );
  CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE INDEX idx_airports_ident ON airports(ident COLLATE NOCASE);
  CREATE INDEX idx_airports_weather_code ON airports(weather_code COLLATE NOCASE);
  CREATE INDEX idx_airports_iata ON airports(iata_code COLLATE NOCASE);
  CREATE INDEX idx_airports_name ON airports(name COLLATE NOCASE);
  CREATE INDEX idx_airports_municipality ON airports(municipality COLLATE NOCASE);
  CREATE INDEX idx_runways_airport ON runways(airport_id);
  CREATE INDEX idx_frequencies_airport ON frequencies(airport_id);
`);

const insertAirport = db.prepare(`
  INSERT INTO airports (
    id, ident, weather_code, iata_code, name, municipality, country_code,
    region_code, type, latitude, longitude, elevation_ft
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const includedAirportIds = new Set();
let airportCount = 0;

db.exec('BEGIN');
for (const row of airportRows) {
  const id = integer(row.id);
  const latitude = number(row.latitude_deg);
  const longitude = number(row.longitude_deg);
  const ident = nullable(row.ident)?.toUpperCase();
  if (id === null || latitude === null || longitude === null || !ident || row.type === 'closed') continue;
  const gpsCode = nullable(row.gps_code)?.toUpperCase();
  const weatherCode = /^[A-Z0-9]{4}$/.test(gpsCode ?? '')
    ? gpsCode
    : /^[A-Z0-9]{4}$/.test(ident) ? ident : null;
  insertAirport.run(
    id,
    ident,
    weatherCode,
    nullable(row.iata_code)?.toUpperCase() ?? null,
    row.name || ident,
    nullable(row.municipality),
    row.iso_country || '',
    row.iso_region || '',
    row.type || 'unknown',
    latitude,
    longitude,
    integer(row.elevation_ft)
  );
  includedAirportIds.add(id);
  airportCount += 1;
}
db.exec('COMMIT');

const insertFrequency = db.prepare(`
  INSERT INTO frequencies (id, airport_id, type, description, frequency_mhz)
  VALUES (?, ?, ?, ?, ?)
`);
let frequencyCount = 0;
db.exec('BEGIN');
for (const row of frequencyRows) {
  const id = integer(row.id);
  const airportId = integer(row.airport_ref);
  const frequencyMhz = number(row.frequency_mhz);
  if (id === null || airportId === null || frequencyMhz === null || frequencyMhz <= 0 || !includedAirportIds.has(airportId)) continue;
  insertFrequency.run(
    id,
    airportId,
    row.type || 'COM',
    nullable(row.description),
    frequencyMhz
  );
  frequencyCount += 1;
}
db.exec('COMMIT');

const insertRunway = db.prepare(`
  INSERT INTO runways (
    id, airport_id, length_ft, width_ft, surface, lighted, closed,
    low_ident, low_heading_true, high_ident, high_heading_true
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
let runwayCount = 0;
db.exec('BEGIN');
for (const row of runwayRows) {
  const id = integer(row.id);
  const airportId = integer(row.airport_ref);
  if (id === null || airportId === null || !includedAirportIds.has(airportId)) continue;
  insertRunway.run(
    id,
    airportId,
    integer(row.length_ft),
    integer(row.width_ft),
    nullable(row.surface),
    row.lighted === '1' ? 1 : 0,
    row.closed === '1' ? 1 : 0,
    nullable(row.le_ident),
    heading(row.le_heading_degT),
    nullable(row.he_ident),
    heading(row.he_heading_degT)
  );
  runwayCount += 1;
}
db.exec('COMMIT');

const metadata = db.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)');
metadata.run('source', 'OurAirports public-domain CSV export');
metadata.run('source_date', new Date().toISOString().slice(0, 10));
metadata.run('airport_count', String(airportCount));
metadata.run('runway_count', String(runwayCount));
metadata.run('frequency_count', String(frequencyCount));
db.exec('PRAGMA user_version = 2; VACUUM;');
db.close();

console.log(`Generated ${outputPath} with ${airportCount} airports, ${runwayCount} runways, and ${frequencyCount} frequencies.`);
