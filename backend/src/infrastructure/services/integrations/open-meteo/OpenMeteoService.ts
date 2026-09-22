import type {
  WeatherForecastDto,
  WeatherForecastResult,
  WeatherHourlyPoint,
} from '../../../../domain/dtos/weather/weather-forecast.dto';
import type { OpenMeteoApiResponse, OpenMeteoFetchInput } from './types';

const DEFAULT_BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000;
const MIN_FORECAST_DAYS = 1;
const MAX_FORECAST_DAYS = 7;
const HOURLY_VARS = [
  'temperature_2m',
  'precipitation',
  'precipitation_probability',
  'wind_speed_10m',
  'wind_gusts_10m',
  'relative_humidity_2m',
] as const;

interface CacheEntry {
  readonly forecast: WeatherForecastDto;
  readonly expiresAt: number;
}

interface OpenMeteoServiceOptions {
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly cacheTtlMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

/**
 * HTTP wrapper for the Open-Meteo public forecast API.
 *
 * Design notes:
 * - All units are pinned (`wind_speed_unit=kmh`, `temperature_unit=celsius`,
 *   `precipitation_unit=mm`) and `timezone=auto` so timestamps land in the
 *   Field's local timezone.
 * - `forecast_days` is clamped to [1, 7]; beyond 7 the model accuracy degrades.
 * - In-memory TTL cache keyed by rounded coordinates. Process-local: in
 *   multi-replica deployments cache hit-rate degrades but correctness is unaffected.
 * - Fail-soft: timeout/network/4xx/5xx errors return a structured
 *   `{available:false, reason}` instead of throwing.
 */
export class OpenMeteoService {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly cache: Map<string, CacheEntry> = new Map();

  constructor(options: OpenMeteoServiceOptions = {}) {
    this.baseUrl = options.baseUrl ?? process.env.OPEN_METEO_BASE_URL ?? DEFAULT_BASE_URL;
    this.timeoutMs =
      options.timeoutMs ?? readPositiveIntEnv('OPEN_METEO_TIMEOUT_MS') ?? DEFAULT_TIMEOUT_MS;
    this.cacheTtlMs =
      options.cacheTtlMs ?? readPositiveIntEnv('OPEN_METEO_CACHE_TTL_MS') ?? DEFAULT_CACHE_TTL_MS;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? Date.now;
  }

  async fetchForecast(input: OpenMeteoFetchInput): Promise<WeatherForecastResult> {
    const days = clampForecastDays(input.forecastDays);
    const cacheKey = buildCacheKey(input.latitude, input.longitude, days);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) {
      return cached.forecast;
    }
    const url = this.buildUrl(input.latitude, input.longitude, days);
    const raw = await this.requestSafely(url);
    if (!raw.ok) {
      return { available: false, reason: raw.reason };
    }
    const forecast = normalizeResponse(raw.data, this.now());
    this.cache.set(cacheKey, { forecast, expiresAt: this.now() + this.cacheTtlMs });
    return forecast;
  }

  private buildUrl(latitude: number, longitude: number, forecastDays: number): string {
    const params = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      hourly: HOURLY_VARS.join(','),
      wind_speed_unit: 'kmh',
      temperature_unit: 'celsius',
      precipitation_unit: 'mm',
      timezone: 'auto',
      forecast_days: forecastDays.toString(),
    });
    return `${this.baseUrl}?${params.toString()}`;
  }

  private async requestSafely(
    url: string,
  ): Promise<{ ok: true; data: OpenMeteoApiResponse } | { ok: false; reason: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, { signal: controller.signal });
      if (!response.ok) {
        return { ok: false, reason: `Open-Meteo HTTP ${response.status}` };
      }
      const data = (await response.json()) as OpenMeteoApiResponse;
      return { ok: true, data };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      return { ok: false, reason: `Open-Meteo request failed: ${reason}` };
    } finally {
      clearTimeout(timer);
    }
  }
}

function readPositiveIntEnv(key: string): number | undefined {
  const raw = process.env[key];
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function clampForecastDays(value: number): number {
  if (!Number.isFinite(value)) return MIN_FORECAST_DAYS;
  return Math.min(MAX_FORECAST_DAYS, Math.max(MIN_FORECAST_DAYS, Math.trunc(value)));
}

function buildCacheKey(latitude: number, longitude: number, forecastDays: number): string {
  return `${latitude.toFixed(2)}|${longitude.toFixed(2)}|${forecastDays}`;
}

function normalizeResponse(raw: OpenMeteoApiResponse, fetchedAtMs: number): WeatherForecastDto {
  const hourly: WeatherHourlyPoint[] = raw.hourly.time.map((time, i) => ({
    time,
    temperatureCelsius: raw.hourly.temperature_2m[i],
    precipitationMm: raw.hourly.precipitation[i],
    precipitationProbabilityPercent: raw.hourly.precipitation_probability[i],
    windSpeedKmh: raw.hourly.wind_speed_10m[i],
    windGustsKmh: raw.hourly.wind_gusts_10m[i],
    relativeHumidityPercent: raw.hourly.relative_humidity_2m[i],
  }));
  return {
    available: true,
    latitude: raw.latitude,
    longitude: raw.longitude,
    timezone: raw.timezone,
    utcOffsetSeconds: raw.utc_offset_seconds,
    hourly,
    fetchedAt: new Date(fetchedAtMs).toISOString(),
  };
}
