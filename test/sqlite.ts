import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

export function routeTestDatabase(filePath = ':memory:') {
  const sqlite = new DatabaseSync(filePath);
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE route_plans (id TEXT PRIMARY KEY, title TEXT, waypoints_json TEXT, cruise_speed_kt REAL, fuel_burn_per_hour REAL, fuel_unit TEXT, wind_direction_true REAL, wind_speed_kt REAL, wind_source TEXT, wind_station TEXT, wind_station_distance_km REAL, wind_observed_at REAL, airac_cycle TEXT, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE logbook_flights (id TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE planned_flights (id TEXT PRIMARY KEY, route_plan_id TEXT REFERENCES route_plans(id), departure_airport TEXT, arrival_airport TEXT, departure_date TEXT, departure_time TEXT, aircraft_profile_id TEXT, weight_balance_id TEXT, local_area INTEGER, planning_status TEXT DEFAULT 'DRAFT', logbook_flight_id TEXT REFERENCES logbook_flights(id), created_at INTEGER, updated_at INTEGER);
    CREATE TABLE route_edit_ownership (route_id TEXT PRIMARY KEY REFERENCES route_plans(id) ON DELETE CASCADE, flight_id TEXT REFERENCES planned_flights(id) ON DELETE CASCADE);
    CREATE TABLE logbook_route_snapshots (flight_id TEXT PRIMARY KEY REFERENCES logbook_flights(id), source_route_plan_id TEXT REFERENCES route_plans(id), attached_at INTEGER, payload TEXT);
    CREATE TABLE weight_balance_calculations (id TEXT PRIMARY KEY, profile_id TEXT, profile_group_id TEXT, profile_revision INTEGER, registration TEXT, title TEXT, calculation_date TEXT, input_json TEXT, result_json TEXT, logbook_flight_id TEXT, created_at INTEGER);
    CREATE TABLE aircraft_profiles (id TEXT PRIMARY KEY, status TEXT);
  `);
  const connectionAdapter = (connection: DatabaseSync) => ({
    async getFirstAsync(sql: string, ...values: (number | string | null)[]) { return connection.prepare(sql).get(...values) ?? null; },
    async getAllAsync(sql: string, ...values: (number | string | null)[]) { return connection.prepare(sql).all(...values); },
    async runAsync(sql: string, ...values: (number | string | null)[]) { return connection.prepare(sql).run(...values); }
  });
  const adapter = {
    ...connectionAdapter(sqlite),
    async withExclusiveTransactionAsync(task: (tx: SQLiteDatabase) => Promise<void>) {
      const transaction = filePath === ':memory:' ? sqlite : new DatabaseSync(filePath);
      transaction.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
      try { await task(connectionAdapter(transaction) as unknown as SQLiteDatabase); transaction.exec('COMMIT'); } catch (error) { transaction.exec('ROLLBACK'); throw error; }
      finally { if (transaction !== sqlite) transaction.close(); }
    },
    async withTransactionAsync(task: () => Promise<void>) {
      sqlite.exec('BEGIN'); try { await task(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    }
  };
  return { db: adapter as unknown as SQLiteDatabase, sqlite };
}
