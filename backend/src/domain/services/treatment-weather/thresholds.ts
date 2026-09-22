/**
 * Default operational thresholds for evaluating whether a forecasted hour is
 * suitable for a treatment application. Units are pinned to the values that
 * `OpenMeteoService` always requests (km/h, °C, mm, %).
 *
 * These defaults are intentionally generic and conservative. Per-product or
 * per-category overrides can be layered on top later without changing the
 * evaluator signature.
 */
export interface TreatmentThresholds {
  readonly windMaxKmh: number;
  readonly rainProbabilityMaxPercent: number;
  readonly precipitationMaxMmPerHour: number;
  readonly tempMinCelsius: number;
  readonly tempMaxCelsius: number;
  readonly humidityMaxPercent: number;
  readonly humidityMinPercent: number;
  readonly noRainHoursPostApplication: number;
}

export const DEFAULT_TREATMENT_THRESHOLDS: TreatmentThresholds = {
  windMaxKmh: 20,
  rainProbabilityMaxPercent: 30,
  precipitationMaxMmPerHour: 0.2,
  tempMinCelsius: 5,
  tempMaxCelsius: 35,
  humidityMaxPercent: 95,
  humidityMinPercent: 30,
  noRainHoursPostApplication: 6,
};
