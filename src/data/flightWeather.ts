import type { SQLiteDatabase } from 'expo-sqlite';
import { fetchDwdWarnings } from '@/data/dwd';
import { getAirport, getNearbyAirports } from '@/data/database';
import { getRoutePlan } from '@/data/routePlans';
import type { WeatherBundle } from '@/domain/models';
import { DefaultWeatherRepository, type WeatherRepository } from '@/data/weatherRepository';
import type { FlightWeatherAirportSnapshot, FlightWeatherBriefing } from '@/domain/flightWeather';

interface BriefingRow {
  flight_id: string;
  departure_airport: string;
  arrival_airport: string;
  generated_at: number;
  payload: string;
}

const message = (error: unknown): string => error instanceof Error ? error.message : 'Weather data is unavailable.';

async function captureAirport(db: SQLiteDatabase, ident: string, refresh = true, sharedRepository?: WeatherRepository): Promise<FlightWeatherAirportSnapshot> {
  const requestedIdent = ident.trim().toUpperCase();
  const airport = requestedIdent ? await getAirport(db, requestedIdent) : null;
  const weatherIdent = airport?.weatherCode ?? (/^[A-Z0-9]{4}$/.test(requestedIdent) ? requestedIdent : null);
  const repository = sharedRepository ?? new DefaultWeatherRepository(db);
  const [weatherResult, warningsResult] = await Promise.allSettled([
    weatherIdent ? repository.getWeather(weatherIdent, refresh) : Promise.resolve(null),
    airport?.countryCode === 'DE' ? fetchDwdWarnings(airport.latitude, airport.longitude) : Promise.resolve([])
  ]);
  const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
  let metar = weather?.metar ?? null;
  let taf = weather?.taf ?? null;
  let fallbackError: string | null = null;
  if (airport && (!metar || !taf)) {
    try {
      const nearby = await getNearbyAirports(db, airport, { radiusKm: 120, limit: 24, weatherStationsOnly: true });
      const codes = [...new Set(nearby.map((candidate) => candidate.airport.weatherCode).filter((code): code is string => Boolean(code && code !== weatherIdent)))];
      const fallback = codes.length ? await repository.getWeatherBatch(codes, refresh) : {};
      metar ??= nearby.map((candidate) => candidate.airport.weatherCode ? fallback[candidate.airport.weatherCode]?.metar : null).find(Boolean) ?? null;
      taf ??= nearby.map((candidate) => candidate.airport.weatherCode ? fallback[candidate.airport.weatherCode]?.taf : null).find(Boolean) ?? null;
    } catch (error) {
      fallbackError = message(error);
    }
  }
  const warnings = warningsResult.status === 'fulfilled' ? warningsResult.value : [];
  const errors = [
    weatherResult.status === 'rejected' ? message(weatherResult.reason) : null,
    warningsResult.status === 'rejected' ? message(warningsResult.reason) : null,
    fallbackError
  ].filter((value): value is string => Boolean(value));
  return {
    requestedIdent,
    airportName: airport?.name ?? null,
    weatherIdent,
    metarIdent: metar?.icao ?? null,
    tafIdent: taf?.icao ?? null,
    metar: metar?.raw ?? null,
    taf: taf?.raw ?? null,
    flightCategory: metar?.category ?? null,
    observedWeather: metar?.weather ?? [],
    forecastWeather: [...new Set(taf?.periods.flatMap((period) => period.weather) ?? [])],
    dwdWarnings: warnings.map((warning) => ({
      headline: warning.headline,
      severity: warning.severity,
      regionName: warning.regionName,
      onset: warning.onset,
      expires: warning.expires
    })),
    error: errors.length ? errors.join(' · ') : null
  };
}

export async function getFlightWeatherBriefing(db: SQLiteDatabase, flightId: string): Promise<FlightWeatherBriefing | null> {
  const row = await db.getFirstAsync<BriefingRow>('SELECT * FROM logbook_weather_briefings WHERE flight_id = ?', flightId);
  if (!row) return null;
  const payload = JSON.parse(row.payload) as Pick<FlightWeatherBriefing, 'airports'>;
  return {
    flightId: row.flight_id,
    departureAirport: row.departure_airport,
    arrivalAirport: row.arrival_airport,
    generatedAt: row.generated_at,
    airports: payload.airports
  };
}

export async function generateFlightWeatherBriefing(
  db: SQLiteDatabase,
  flightId: string,
  departureAirport: string,
  arrivalAirport: string
): Promise<FlightWeatherBriefing> {
  const departure = departureAirport.trim().toUpperCase();
  const arrival = arrivalAirport.trim().toUpperCase();
  if (!departure || !arrival) throw new Error('Enter both departure and arrival airports before generating a weather briefing.');
  const idents = [...new Set([departure, arrival])];
  const airports = await Promise.all(idents.map((ident) => captureAirport(db, ident)));
  const currentFlight = await db.getFirstAsync<{ departure_airport: string; arrival_airport: string }>(
    'SELECT departure_airport, arrival_airport FROM logbook_flights WHERE id = ?', flightId
  );
  if (!currentFlight || currentFlight.departure_airport !== departure || currentFlight.arrival_airport !== arrival) {
    throw new Error('The saved flight changed while weather was loading. Generate a new briefing for its current route.');
  }
  const briefing: FlightWeatherBriefing = { flightId, departureAirport: departure, arrivalAirport: arrival, generatedAt: Date.now(), airports };
  await db.runAsync(
    `INSERT INTO logbook_weather_briefings (flight_id, departure_airport, arrival_airport, generated_at, payload)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(flight_id) DO UPDATE SET departure_airport=excluded.departure_airport, arrival_airport=excluded.arrival_airport, generated_at=excluded.generated_at, payload=excluded.payload`,
    flightId, departure, arrival, briefing.generatedAt, JSON.stringify({ airports })
  );
  return briefing;
}

export async function getPlannedWeatherBriefing(db: SQLiteDatabase, flightId: string): Promise<FlightWeatherBriefing | null> {
  const row = await db.getFirstAsync<{ payload: string }>('SELECT payload FROM planned_weather_briefings WHERE flight_id = ?', flightId);
  if (!row) return null;
  try {
    const briefing = JSON.parse(row.payload) as FlightWeatherBriefing;
    return Array.isArray(briefing.airports) ? briefing : null;
  } catch { return null; }
}

// Capture each reporting station once, even when several route aerodromes use it.
function sharedWeatherRepository(db: SQLiteDatabase): WeatherRepository {
  const repository = new DefaultWeatherRepository(db);
  const requests = new Map<string, Promise<WeatherBundle | undefined>>();
  return {
    async getWeather(icao, force) {
      if (!requests.has(icao)) requests.set(icao, repository.getWeather(icao, force));
      const weather = await requests.get(icao)!;
      if (!weather) throw new Error(`No weather is available for ${icao}`);
      return weather;
    },
    async getWeatherBatch(icaos, force) {
      const missing = icaos.filter((icao) => !requests.has(icao));
      if (missing.length) {
        const batch = repository.getWeatherBatch(missing, force);
        for (const icao of missing) requests.set(icao, batch.then((result) => result[icao]));
      }
      const results = await Promise.all(icaos.map(async (icao) => [icao, await requests.get(icao)!] as const));
      return Object.fromEntries(results.filter((entry): entry is readonly [string, WeatherBundle] => Boolean(entry[1])));
    }
  };
}
export async function getPlannedBriefingAirportIdents(db: SQLiteDatabase, flightId: string): Promise<string[]> {
  const flight = await db.getFirstAsync<{ departure_airport: string; arrival_airport: string; route_plan_id: string | null }>('SELECT departure_airport, arrival_airport, route_plan_id FROM planned_flights WHERE id = ?', flightId);
  if (!flight) return [];
  const route = flight.route_plan_id ? await getRoutePlan(db, flight.route_plan_id) : null;
  if (flight.route_plan_id && !route) throw new Error('The planned route is unavailable. Reopen the flight before refreshing weather.');
  return [...new Set([flight.departure_airport, ...(route?.waypoints.filter((point) => point.source === 'AIRPORT').map((point) => point.ident) ?? []), flight.arrival_airport].map((ident) => ident.trim().toUpperCase()).filter(Boolean))];
}
export async function getValidPlannedWeatherBriefing(db: SQLiteDatabase, flightId: string): Promise<FlightWeatherBriefing | null> {
  const saved = await getPlannedWeatherBriefing(db, flightId);
  if (!saved) return null;
  const current = await db.getFirstAsync<{ departure_airport: string; arrival_airport: string }>('SELECT departure_airport, arrival_airport FROM planned_flights WHERE id = ?', flightId);
  if (!current || saved.departureAirport !== current.departure_airport || saved.arrivalAirport !== current.arrival_airport) return null;
  const idents = await getPlannedBriefingAirportIdents(db, flightId);
  return JSON.stringify(saved.airports.map((airport) => airport.requestedIdent)) === JSON.stringify(idents) ? saved : null;
}
export async function capturePlannedWeatherBriefing(db: SQLiteDatabase, flightId: string, departure: string, arrival: string, refresh = false): Promise<FlightWeatherBriefing> {
  const idents = await getPlannedBriefingAirportIdents(db, flightId);
  const repository = sharedWeatherRepository(db);
  const airports = await Promise.all(idents.map((ident) => captureAirport(db, ident, refresh, repository)));
  const current = await db.getFirstAsync<{ departure_airport: string; arrival_airport: string }>('SELECT departure_airport, arrival_airport FROM planned_flights WHERE id = ?', flightId);
  const currentIdents = await getPlannedBriefingAirportIdents(db, flightId);
  if (!current || current.departure_airport !== departure || current.arrival_airport !== arrival || JSON.stringify(currentIdents) !== JSON.stringify(idents)) throw new Error('Flight route changed while weather was loading. Refresh the briefing.');
  if (!airports.some((airport) => airport.metar || airport.taf)) throw new Error('No weather reports are available. Please retry when connected.');
  const briefing: FlightWeatherBriefing = { flightId, departureAirport: departure, arrivalAirport: arrival, generatedAt: Date.now(), airports };
  await db.runAsync('INSERT INTO planned_weather_briefings (flight_id, payload) VALUES (?, ?) ON CONFLICT(flight_id) DO UPDATE SET payload=excluded.payload', flightId, JSON.stringify(briefing));
  return briefing;
}

export async function attachWeatherBriefing(db: SQLiteDatabase, flightId: string, briefing: FlightWeatherBriefing): Promise<void> {
  await db.runAsync(`INSERT INTO logbook_weather_briefings (flight_id, departure_airport, arrival_airport, generated_at, payload)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(flight_id) DO UPDATE SET departure_airport=excluded.departure_airport, arrival_airport=excluded.arrival_airport, generated_at=excluded.generated_at, payload=excluded.payload`,
    flightId, briefing.departureAirport, briefing.arrivalAirport, briefing.generatedAt, JSON.stringify({ airports: briefing.airports }));
}
