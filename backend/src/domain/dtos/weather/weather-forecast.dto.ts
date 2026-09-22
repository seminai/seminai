/**
 * Hourly weather observation for a single timestamp.
 * Units are pinned to the values requested explicitly in the Open-Meteo query.
 */
export interface WeatherHourlyPoint {
  readonly time: string;
  readonly temperatureCelsius: number;
  readonly precipitationMm: number;
  readonly precipitationProbabilityPercent: number;
  readonly windSpeedKmh: number;
  readonly windGustsKmh: number;
  readonly relativeHumidityPercent: number;
}

/**
 * Normalized weather forecast returned by `OpenMeteoService` to the rest of
 * the application. Independent from the raw Open-Meteo response shape.
 */
export interface WeatherForecastDto {
  readonly available: true;
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone: string;
  readonly utcOffsetSeconds: number;
  readonly hourly: readonly WeatherHourlyPoint[];
  readonly fetchedAt: string;
}

/**
 * Sentinel returned when the forecast cannot be retrieved (network error,
 * timeout, 5xx). Callers are expected to surface a human-readable message
 * to the agent or user instead of throwing.
 */
export interface WeatherForecastUnavailable {
  readonly available: false;
  readonly reason: string;
}

export type WeatherForecastResult = WeatherForecastDto | WeatherForecastUnavailable;
