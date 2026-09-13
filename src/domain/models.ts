export type FlightCategory = 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | 'UNKNOWN';

export interface Airport {
  id: number;
  ident: string;
  weatherCode: string | null;
  iataCode: string | null;
  name: string;
  municipality: string | null;
  countryCode: string;
  regionCode: string;
  type: string;
  latitude: number;
  longitude: number;
  elevationFt: number | null;
}

export interface NearbyAirport {
  airport: Airport;
  distanceKm: number;
}

export interface Runway {
  id: number;
  airportId: number;
  lengthFt: number | null;
  widthFt: number | null;
  surface: string | null;
  lighted: boolean;
  closed: boolean;
  lowIdent: string | null;
  lowHeadingTrue: number | null;
  highIdent: string | null;
  highHeadingTrue: number | null;
}

export interface AirportFrequency {
  id: number;
  airportId: number;
  type: string;
  description: string | null;
  frequencyMhz: number;
}

export interface CloudLayer {
  cover: string;
  baseFt: number | null;
  type: string | null;
}

export interface MetarTrend {
  change: 'TEMPO' | 'BECMG' | 'NOSIG';
  raw: string;
  windDirectionTrue: number | null;
  windSpeedKt: number | null;
  windGustKt: number | null;
  visibilitySm: number | null;
  visibilityIsTenKmOrMore: boolean;
  weather: string[];
  clouds: CloudLayer[];
  verticalVisibilityFt: number | null;
}

export interface MetarObservation {
  icao: string;
  raw: string;
  observedAt: number;
  reportType: string;
  temperatureC: number | null;
  dewpointC: number | null;
  windDirectionTrue: number | null;
  windSpeedKt: number | null;
  windGustKt: number | null;
  visibilitySm: number | null;
  visibilityQualifier: 'LESS_THAN' | 'MORE_THAN' | null;
  visibilityIsTenKmOrMore: boolean;
  cavok: boolean;
  pressureHpa: number | null;
  weather: string[];
  clouds: CloudLayer[];
  verticalVisibilityFt: number | null;
  category: FlightCategory;
  trends: MetarTrend[];
}

export type TafChange = 'BASE' | 'FM' | 'BECMG' | 'TEMPO' | 'PROB';

export interface TafPeriod {
  from: number;
  to: number;
  becomingAt: number | null;
  change: TafChange;
  probability: number | null;
  windDirectionTrue: number | null;
  windSpeedKt: number | null;
  windGustKt: number | null;
  visibilitySm: number | null;
  visibilityQualifier: 'LESS_THAN' | 'MORE_THAN' | null;
  visibilityIsTenKmOrMore: boolean;
  weather: string[];
  clouds: CloudLayer[];
  verticalVisibilityFt: number | null;
  category: FlightCategory;
}

export interface TafForecast {
  icao: string;
  raw: string;
  issuedAt: number;
  validFrom: number;
  validTo: number;
  periods: TafPeriod[];
}

export interface TafHour {
  at: number;
  prevailing: TafPeriod | null;
  overlays: TafPeriod[];
}

export interface WeatherBundle {
  icao: string;
  metar: MetarObservation | null;
  taf: TafForecast | null;
  fetchedAt: number;
  isStale: boolean;
  refreshError?: string;
}

export interface RunwayWindComponent {
  runwayIdent: string;
  headingTrue: number;
  crosswindKt: number;
  headwindKt: number;
  gustCrosswindKt: number | null;
  gustHeadwindKt: number | null;
}

export type SpeedUnit = 'kt' | 'kmh' | 'mph' | 'ms';
export type VisibilityUnit = 'sm' | 'km';
export type AltitudeUnit = 'ft' | 'm';
export type TemperatureUnit = 'c' | 'f';
export type PressureUnit = 'hpa' | 'inhg';
export type TimeMode = 'local' | 'utc';
export type ThemeMode = 'system' | 'light' | 'dark';

export interface UnitPreferences {
  speed: SpeedUnit;
  visibility: VisibilityUnit;
  altitude: AltitudeUnit;
  temperature: TemperatureUnit;
  pressure: PressureUnit;
  time: TimeMode;
  theme: ThemeMode;
  mapStartAirport: string;
  onboardingCompleted?: boolean;
  defaultAircraftProfileId?: string;
  lastMapRouteId?: string;
  safetyAcknowledged: boolean;
}

export const DEFAULT_PREFERENCES: UnitPreferences = {
  speed: 'kt',
  visibility: 'km',
  altitude: 'ft',
  temperature: 'c',
  pressure: 'hpa',
  time: 'local',
  theme: 'system',
  mapStartAirport: '',
  onboardingCompleted: false,
  safetyAcknowledged: false
};
