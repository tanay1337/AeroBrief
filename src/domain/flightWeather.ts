export interface FlightWeatherWarningSnapshot {
  headline: string;
  severity: string;
  regionName: string;
  onset: string | null;
  expires: string | null;
}

export interface FlightWeatherAirportSnapshot {
  requestedIdent: string;
  airportName: string | null;
  weatherIdent: string | null;
  metarIdent: string | null;
  tafIdent: string | null;
  metar: string | null;
  taf: string | null;
  flightCategory: string | null;
  observedWeather: string[];
  forecastWeather: string[];
  dwdWarnings: FlightWeatherWarningSnapshot[];
  error: string | null;
}

export interface FlightWeatherBriefing {
  flightId: string;
  departureAirport: string;
  arrivalAirport: string;
  generatedAt: number;
  airports: FlightWeatherAirportSnapshot[];
}

// Reports from a shared station can be combined only when their TAFs also match.
// Airport-specific warnings and errors stay in the original snapshots.
export function groupFlightWeatherReports(reports: FlightWeatherAirportSnapshot[]): FlightWeatherAirportSnapshot[][] {
  const groups = new Map<string, FlightWeatherAirportSnapshot[]>();
  for (const report of reports) {
    const key = report.metar ? JSON.stringify([report.metarIdent, report.metar, report.tafIdent, report.taf, report.flightCategory, report.observedWeather, report.forecastWeather]) : `missing:${report.requestedIdent}`;
    const group = groups.get(key) ?? [];
    group.push(report);
    groups.set(key, group);
  }
  return [...groups.values()];
}
