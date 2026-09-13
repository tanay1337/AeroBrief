import type { SQLiteDatabase } from 'expo-sqlite';
import type { WeatherBundle } from '@/domain/models';
import { getWeatherCaches, saveWeatherCache } from './database';
import { fetchMetars, fetchTafs } from './noaa';

const FRESH_FOR_MS = 5 * 60 * 1000;
const MAX_BATCH_SIZE = 50;

const errorMessage = (result: PromiseSettledResult<unknown>): string | null =>
  result.status === 'rejected'
    ? result.reason instanceof Error ? result.reason.message : 'Refresh failed'
    : null;

export interface WeatherRepository {
  getWeather(icao: string, force?: boolean): Promise<WeatherBundle>;
  getWeatherBatch(icaos: string[], force?: boolean): Promise<Record<string, WeatherBundle>>;
}

export class DefaultWeatherRepository implements WeatherRepository {
  constructor(private readonly db: SQLiteDatabase) {}

  async getWeather(icao: string, force = false): Promise<WeatherBundle> {
    const key = icao.toUpperCase();
    const result = await this.getWeatherBatch([key], force);
    const bundle = result[key];
    if (!bundle) throw new Error(`No weather is available for ${key}`);
    return bundle;
  }

  async getWeatherBatch(icaos: string[], force = false): Promise<Record<string, WeatherBundle>> {
    const keys = [...new Set(icaos.map((value) => value.trim().toUpperCase()))]
      .filter((value) => /^[A-Z0-9]{3,4}$/.test(value))
      .slice(0, MAX_BATCH_SIZE);
    if (keys.length === 0) return {};

    const cached = await getWeatherCaches(this.db, keys);
    const now = Date.now();
    const staleKeys = keys.filter((key) => {
      const value = cached.get(key);
      return force || !value || now - value.fetchedAt >= FRESH_FOR_MS;
    });

    if (staleKeys.length === 0) {
      return Object.fromEntries(keys.map((key) => [key, { ...cached.get(key)!, isStale: false }]));
    }

    const [metarResult, tafResult] = await Promise.allSettled([
      fetchMetars(staleKeys),
      fetchTafs(staleKeys)
    ]);
    const metars = new Map(
      metarResult.status === 'fulfilled' ? metarResult.value.map((value) => [value.icao, value]) : []
    );
    const tafs = new Map(
      tafResult.status === 'fulfilled' ? tafResult.value.map((value) => [value.icao, value]) : []
    );
    const errors = [...new Set([errorMessage(metarResult), errorMessage(tafResult)].filter((message): message is string => Boolean(message)))].join(' · ');

    const output: Record<string, WeatherBundle> = {};
    for (const key of keys) {
      const previous = cached.get(key);
      if (!staleKeys.includes(key) && previous) {
        output[key] = { ...previous, isStale: false };
        continue;
      }

      const bothFailed = metarResult.status === 'rejected' && tafResult.status === 'rejected';
      if (bothFailed && !previous) continue;

      const bundle: WeatherBundle = bothFailed && previous
        ? { ...previous, isStale: true, refreshError: errors }
        : {
            icao: key,
            metar: metarResult.status === 'fulfilled' ? (metars.get(key) ?? null) : (previous?.metar ?? null),
            taf: tafResult.status === 'fulfilled' ? (tafs.get(key) ?? null) : (previous?.taf ?? null),
            fetchedAt: now,
            isStale: false,
            refreshError: errors || undefined
          };
      output[key] = bundle;
      if (!bothFailed) await saveWeatherCache(this.db, bundle);
    }

    if (Object.keys(output).length === 0) {
      const reason = metarResult.status === 'rejected' ? metarResult.reason : tafResult.status === 'rejected' ? tafResult.reason : null;
      throw reason instanceof Error ? reason : new Error('No weather report is available');
    }
    return output;
  }
}
