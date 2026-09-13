import { DatabaseSync } from 'node:sqlite';

const path = process.argv[2] ?? 'assets/airports.db';
const db = new DatabaseSync(path, { readOnly: true });
const scalar = (sql) => db.prepare(sql).get().value;
const airportCount = scalar('SELECT COUNT(*) AS value FROM airports');
const runwayCount = scalar('SELECT COUNT(*) AS value FROM runways');
const frequencyCount = scalar('SELECT COUNT(*) AS value FROM frequencies');
const invalidCoordinates = scalar('SELECT COUNT(*) AS value FROM airports WHERE latitude NOT BETWEEN -90 AND 90 OR longitude NOT BETWEEN -180 AND 180');
const duplicateIdentifiers = scalar('SELECT COUNT(*) AS value FROM (SELECT ident FROM airports GROUP BY ident HAVING COUNT(*) > 1)');
const orphanRunways = scalar('SELECT COUNT(*) AS value FROM runways LEFT JOIN airports ON airports.id = runways.airport_id WHERE airports.id IS NULL');
const orphanFrequencies = scalar('SELECT COUNT(*) AS value FROM frequencies LEFT JOIN airports ON airports.id = frequencies.airport_id WHERE airports.id IS NULL');
const invalidFrequencies = scalar('SELECT COUNT(*) AS value FROM frequencies WHERE frequency_mhz <= 0');
const invalidHeadings = scalar('SELECT COUNT(*) AS value FROM runways WHERE low_heading_true NOT BETWEEN 0 AND 360 OR high_heading_true NOT BETWEEN 0 AND 360');
const sourceDate = db.prepare("SELECT value FROM metadata WHERE key = 'source_date'").get()?.value;
db.close();

const failures = { invalidCoordinates, duplicateIdentifiers, orphanRunways, orphanFrequencies, invalidHeadings, invalidFrequencies };
if (airportCount < 50_000 || runwayCount < 30_000 || frequencyCount < 10_000 || Object.values(failures).some((value) => value !== 0)) {
  console.error({ airportCount, runwayCount, frequencyCount, sourceDate, ...failures });
  process.exit(1);
}
console.log(`Airport database valid: ${airportCount} airports, ${runwayCount} runways, ${frequencyCount} frequencies, source ${sourceDate}.`);
