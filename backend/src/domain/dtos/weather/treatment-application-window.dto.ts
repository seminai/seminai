import type { WeatherRiskDto } from './weather-risk.dto';

/**
 * Contiguous time range during which all weather thresholds are satisfied
 * for a treatment application. Bounds are inclusive on `from`, exclusive on
 * `to`. Both timestamps are in the Field's local timezone.
 */
export interface ApplicationTimeRange {
  readonly from: string;
  readonly to: string;
}

/**
 * Output of `TreatmentWindowEvaluator.evaluate(...)`: all valid application
 * windows in the forecast horizon plus the list of detected risks (relevant
 * even when windows exist, e.g. wind picking up later in the day).
 */
export interface TreatmentApplicationWindowDto {
  readonly applicationWindows: readonly ApplicationTimeRange[];
  readonly risks: readonly WeatherRiskDto[];
  readonly evaluatedAt: string;
  readonly horizonStart: string;
  readonly horizonEnd: string;
}
