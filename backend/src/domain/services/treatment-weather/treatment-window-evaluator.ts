import type {
  WeatherForecastDto,
  WeatherHourlyPoint,
} from '../../dtos/weather/weather-forecast.dto';
import type {
  ApplicationTimeRange,
  TreatmentApplicationWindowDto,
} from '../../dtos/weather/treatment-application-window.dto';
import type {
  WeatherRiskDto,
  WeatherRiskKind,
  WeatherRiskSeverity,
} from '../../dtos/weather/weather-risk.dto';
import type { TreatmentThresholds } from './thresholds';

const DEFAULT_HORIZON_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;

interface EvaluateInput {
  readonly forecast: WeatherForecastDto;
  readonly thresholds: TreatmentThresholds;
  readonly plannedDate: Date | string;
  readonly horizonHours?: number;
  readonly evaluatedAt?: Date;
}

interface ScoredRisk extends WeatherRiskDto {}

/**
 * Pure function. Given a forecast, the operational thresholds and a planned
 * application time, returns:
 *  - the contiguous time ranges within `[plannedDate, plannedDate + horizon]`
 *    where every threshold is satisfied (and no rain falls in the next
 *    `noRainHoursPostApplication` hours);
 *  - a per-kind summary of the worst weather risk detected in the horizon.
 *
 * The evaluator does no I/O; it can be tested deterministically with fixtures.
 */
export function evaluateTreatmentWindow(input: EvaluateInput): TreatmentApplicationWindowDto {
  const horizonHours = input.horizonHours ?? DEFAULT_HORIZON_HOURS;
  const evaluatedAt = (input.evaluatedAt ?? new Date()).toISOString();
  const horizonStartMs = toEpochMs(input.plannedDate);
  const horizonEndMs = horizonStartMs + horizonHours * HOUR_MS;
  const horizonPoints = pickPointsInHorizon(input.forecast.hourly, horizonStartMs, horizonEndMs);
  const applicationWindows = findApplicationWindows(
    input.forecast.hourly,
    horizonPoints,
    input.thresholds,
  );
  const risks = collectRisks(horizonPoints, input.thresholds);
  return {
    applicationWindows,
    risks,
    evaluatedAt,
    horizonStart: new Date(horizonStartMs).toISOString(),
    horizonEnd: new Date(horizonEndMs).toISOString(),
  };
}

function toEpochMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function pickPointsInHorizon(
  all: readonly WeatherHourlyPoint[],
  startMs: number,
  endMs: number,
): readonly WeatherHourlyPoint[] {
  return all.filter((p) => {
    const t = new Date(p.time).getTime();
    return t >= startMs && t < endMs;
  });
}

function isPointApplicable(point: WeatherHourlyPoint, t: TreatmentThresholds): boolean {
  if (point.windSpeedKmh > t.windMaxKmh) return false;
  if (point.windGustsKmh > t.windMaxKmh * 1.5) return false;
  if (point.precipitationProbabilityPercent > t.rainProbabilityMaxPercent) return false;
  if (point.precipitationMm > t.precipitationMaxMmPerHour) return false;
  if (point.temperatureCelsius < t.tempMinCelsius) return false;
  if (point.temperatureCelsius > t.tempMaxCelsius) return false;
  if (point.relativeHumidityPercent > t.humidityMaxPercent) return false;
  if (point.relativeHumidityPercent < t.humidityMinPercent) return false;
  return true;
}

function noRainAfter(
  all: readonly WeatherHourlyPoint[],
  index: number,
  hoursAhead: number,
  t: TreatmentThresholds,
): boolean {
  const lookahead = all.slice(index + 1, index + 1 + hoursAhead);
  return lookahead.every(
    (p) =>
      p.precipitationMm <= t.precipitationMaxMmPerHour &&
      p.precipitationProbabilityPercent <= t.rainProbabilityMaxPercent,
  );
}

function findApplicationWindows(
  all: readonly WeatherHourlyPoint[],
  horizonPoints: readonly WeatherHourlyPoint[],
  thresholds: TreatmentThresholds,
): readonly ApplicationTimeRange[] {
  const windows: ApplicationTimeRange[] = [];
  let runStart: WeatherHourlyPoint | null = null;
  let lastApplicable: WeatherHourlyPoint | null = null;
  for (const point of horizonPoints) {
    const idxInAll = all.indexOf(point);
    const applicable =
      isPointApplicable(point, thresholds) &&
      noRainAfter(all, idxInAll, thresholds.noRainHoursPostApplication, thresholds);
    if (applicable) {
      if (!runStart) runStart = point;
      lastApplicable = point;
      continue;
    }
    if (runStart && lastApplicable) {
      windows.push(rangeFrom(runStart, lastApplicable));
      runStart = null;
      lastApplicable = null;
    }
  }
  if (runStart && lastApplicable) {
    windows.push(rangeFrom(runStart, lastApplicable));
  }
  return windows;
}

function rangeFrom(from: WeatherHourlyPoint, to: WeatherHourlyPoint): ApplicationTimeRange {
  const toEndMs = new Date(to.time).getTime() + HOUR_MS;
  return { from: from.time, to: new Date(toEndMs).toISOString() };
}

function collectRisks(
  horizonPoints: readonly WeatherHourlyPoint[],
  t: TreatmentThresholds,
): readonly WeatherRiskDto[] {
  const risks: ScoredRisk[] = [];
  pushIfPresent(risks, worstRain(horizonPoints, t));
  pushIfPresent(risks, worstWind(horizonPoints, t));
  pushIfPresent(risks, worstFrost(horizonPoints, t));
  pushIfPresent(risks, worstHeat(horizonPoints, t));
  pushIfPresent(risks, worstHumidity(horizonPoints, t));
  return risks;
}

function pushIfPresent(target: ScoredRisk[], value: ScoredRisk | null): void {
  if (value) target.push(value);
}

function worstRain(
  points: readonly WeatherHourlyPoint[],
  t: TreatmentThresholds,
): ScoredRisk | null {
  const violators = points.filter(
    (p) =>
      p.precipitationProbabilityPercent > t.rainProbabilityMaxPercent ||
      p.precipitationMm > t.precipitationMaxMmPerHour,
  );
  if (violators.length === 0) return null;
  const worst = violators.reduce((a, b) =>
    b.precipitationProbabilityPercent > a.precipitationProbabilityPercent ? b : a,
  );
  return makeRisk(
    'rain',
    severityFromRatio(worst.precipitationProbabilityPercent, t.rainProbabilityMaxPercent),
    worst.time,
    `Pioggia probabile (${worst.precipitationProbabilityPercent}%, ${worst.precipitationMm} mm/h)`,
  );
}

function worstWind(
  points: readonly WeatherHourlyPoint[],
  t: TreatmentThresholds,
): ScoredRisk | null {
  const violators = points.filter((p) => p.windSpeedKmh > t.windMaxKmh);
  if (violators.length === 0) return null;
  const worst = violators.reduce((a, b) => (b.windSpeedKmh > a.windSpeedKmh ? b : a));
  return makeRisk(
    'wind',
    severityFromRatio(worst.windSpeedKmh, t.windMaxKmh),
    worst.time,
    `Vento sostenuto (${worst.windSpeedKmh} km/h, raffiche ${worst.windGustsKmh} km/h)`,
  );
}

function worstFrost(
  points: readonly WeatherHourlyPoint[],
  t: TreatmentThresholds,
): ScoredRisk | null {
  const violators = points.filter((p) => p.temperatureCelsius < t.tempMinCelsius);
  if (violators.length === 0) return null;
  const worst = violators.reduce((a, b) => (b.temperatureCelsius < a.temperatureCelsius ? b : a));
  const severity: WeatherRiskSeverity = worst.temperatureCelsius <= 0 ? 'high' : 'medium';
  return makeRisk(
    'frost',
    severity,
    worst.time,
    `Temperatura bassa (${worst.temperatureCelsius}°C)`,
  );
}

function worstHeat(
  points: readonly WeatherHourlyPoint[],
  t: TreatmentThresholds,
): ScoredRisk | null {
  const violators = points.filter((p) => p.temperatureCelsius > t.tempMaxCelsius);
  if (violators.length === 0) return null;
  const worst = violators.reduce((a, b) => (b.temperatureCelsius > a.temperatureCelsius ? b : a));
  return makeRisk(
    'heat',
    severityFromRatio(worst.temperatureCelsius, t.tempMaxCelsius),
    worst.time,
    `Temperatura elevata (${worst.temperatureCelsius}°C)`,
  );
}

function worstHumidity(
  points: readonly WeatherHourlyPoint[],
  t: TreatmentThresholds,
): ScoredRisk | null {
  const violators = points.filter(
    (p) =>
      p.relativeHumidityPercent > t.humidityMaxPercent ||
      p.relativeHumidityPercent < t.humidityMinPercent,
  );
  if (violators.length === 0) return null;
  const worst = violators[0];
  const severity: WeatherRiskSeverity = 'low';
  return makeRisk(
    'humidity',
    severity,
    worst.time,
    `Umidità fuori range (${worst.relativeHumidityPercent}%)`,
  );
}

function severityFromRatio(value: number, threshold: number): WeatherRiskSeverity {
  if (threshold <= 0) return 'high';
  const ratio = value / threshold;
  if (ratio >= 2) return 'high';
  if (ratio >= 1.5) return 'medium';
  return 'low';
}

function makeRisk(
  kind: WeatherRiskKind,
  severity: WeatherRiskSeverity,
  when: string,
  message: string,
): WeatherRiskDto {
  return { kind, severity, when, message };
}
