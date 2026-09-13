const NOAA_GFS_API = 'https://api.open-meteo.com/v1/gfs';
const REQUEST_TIMEOUT_MS = 12_000;

// Six GFS pressure levels for the winds-aloft table.
// Keeping the level set aligned makes side-by-side comparisons meaningful.
const PRESSURE_LEVELS = [1000, 950, 925, 900, 850, 800] as const;
type PressureLevel = typeof PRESSURE_LEVELS[number];

export interface WindLevelGuidance {
  pressureHpa: PressureLevel;
  altitudeFt: number | null;
  speedKt: number | null;
  directionTrue: number | null;
}

export interface ForecastGuidanceHour {
  at: number;
  temperatureC: number | null;
  dewpointC: number | null;
  precipitationProbability: number | null;
  precipitationMm: number | null;
  weatherCode: number | null;
  visibilityMeters: number | null;
  cloudCoverPercent: number | null;
  windSpeedKt: number | null;
  windDirectionTrue: number | null;
  windGustKt: number | null;
  levels: WindLevelGuidance[];
}

export interface ForecastModelGuidance {
  generatedAt: number;
  hours: ForecastGuidanceHour[];
}

type HourlyPayload = Record<string, unknown> & { time?: unknown };

const numberAt = (value: unknown, index: number): number | null => {
  if (!Array.isArray(value)) return null;
  const item = value[index];
  return typeof item === 'number' && Number.isFinite(item) ? item : null;
};

export function mapGfsGuidance(payload: unknown): ForecastModelGuidance {
  if (!payload || typeof payload !== 'object') return { generatedAt: Date.now(), hours: [] };
  const hourly = (payload as { hourly?: HourlyPayload }).hourly;
  const times = Array.isArray(hourly?.time) ? hourly.time : [];
  const hours = times.flatMap((time, index): ForecastGuidanceHour[] => {
    if (typeof time !== 'string') return [];
    const at = Date.parse(time.endsWith('Z') ? time : `${time}Z`) / 1000;
    if (!Number.isFinite(at)) return [];
    return [{
      at,
      temperatureC: numberAt(hourly?.temperature_2m, index),
      dewpointC: numberAt(hourly?.dew_point_2m, index),
      precipitationProbability: numberAt(hourly?.precipitation_probability, index),
      precipitationMm: numberAt(hourly?.precipitation, index),
      weatherCode: numberAt(hourly?.weather_code, index),
      visibilityMeters: numberAt(hourly?.visibility, index),
      cloudCoverPercent: numberAt(hourly?.cloud_cover, index),
      windSpeedKt: numberAt(hourly?.wind_speed_10m, index),
      windDirectionTrue: numberAt(hourly?.wind_direction_10m, index),
      windGustKt: numberAt(hourly?.wind_gusts_10m, index),
      levels: PRESSURE_LEVELS.map((pressureHpa) => {
        const altitudeMeters = numberAt(hourly?.[`geopotential_height_${pressureHpa}hPa`], index);
        return {
          pressureHpa,
          altitudeFt: altitudeMeters === null ? null : altitudeMeters * 3.28084,
          speedKt: numberAt(hourly?.[`wind_speed_${pressureHpa}hPa`], index),
          directionTrue: numberAt(hourly?.[`wind_direction_${pressureHpa}hPa`], index)
        };
      })
    }];
  });
  return { generatedAt: Date.now(), hours };
}

export async function fetchGfsGuidance(latitude: number, longitude: number): Promise<ForecastModelGuidance> {
  const surfaceVariables = [
    'temperature_2m', 'dew_point_2m', 'precipitation_probability', 'precipitation',
    'weather_code', 'visibility', 'cloud_cover', 'wind_speed_10m',
    'wind_direction_10m', 'wind_gusts_10m'
  ];
  const levelVariables = PRESSURE_LEVELS.flatMap((level) => [
    `wind_speed_${level}hPa`, `wind_direction_${level}hPa`, `geopotential_height_${level}hPa`
  ]);
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: [...surfaceVariables, ...levelVariables].join(','),
    wind_speed_unit: 'kn',
    timezone: 'GMT',
    forecast_days: '3'
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${NOAA_GFS_API}?${params}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'AeroBrief/0.9 (mobile aviation weather viewer)' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`NOAA GFS guidance returned ${response.status}`);
    return mapGfsGuidance(await response.json());
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('NOAA GFS guidance request timed out');
    throw error instanceof Error ? error : new Error('NOAA GFS guidance is unavailable');
  } finally {
    clearTimeout(timeout);
  }
}
