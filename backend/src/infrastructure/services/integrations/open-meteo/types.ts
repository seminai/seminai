/**
 * Raw response shape returned by https://api.open-meteo.com/v1/forecast for
 * the hourly variables this service requests. Only the fields actually used
 * are typed; unknown extra fields are tolerated.
 */
export interface OpenMeteoApiResponse {
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone: string;
  readonly utc_offset_seconds: number;
  readonly hourly: {
    readonly time: readonly string[];
    readonly temperature_2m: readonly number[];
    readonly precipitation: readonly number[];
    readonly precipitation_probability: readonly number[];
    readonly wind_speed_10m: readonly number[];
    readonly wind_gusts_10m: readonly number[];
    readonly relative_humidity_2m: readonly number[];
  };
}

export interface OpenMeteoFetchInput {
  readonly latitude: number;
  readonly longitude: number;
  readonly forecastDays: number;
}
