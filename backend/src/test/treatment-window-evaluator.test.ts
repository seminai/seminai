import { evaluateTreatmentWindow } from '../domain/services/treatment-weather/treatment-window-evaluator';
import { DEFAULT_TREATMENT_THRESHOLDS } from '../domain/services/treatment-weather/thresholds';
import type {
  WeatherForecastDto,
  WeatherHourlyPoint,
} from '../domain/dtos/weather/weather-forecast.dto';

const PLANNED_DATE = '2026-05-13T08:00:00';
const FETCHED_AT = '2026-05-13T07:00:00.000Z';

function makeHour(time: string, overrides: Partial<WeatherHourlyPoint> = {}): WeatherHourlyPoint {
  return {
    time,
    temperatureCelsius: 18,
    precipitationMm: 0,
    precipitationProbabilityPercent: 5,
    windSpeedKmh: 8,
    windGustsKmh: 12,
    relativeHumidityPercent: 65,
    ...overrides,
  };
}

function makeForecast(hourly: WeatherHourlyPoint[]): WeatherForecastDto {
  return {
    available: true,
    latitude: 45.4,
    longitude: 11.9,
    timezone: 'Europe/Rome',
    utcOffsetSeconds: 3600,
    hourly,
    fetchedAt: FETCHED_AT,
  };
}

function buildBenignHorizon(): WeatherHourlyPoint[] {
  const points: WeatherHourlyPoint[] = [];
  for (let h = 0; h < 32; h++) {
    const dayOffset = Math.floor((8 + h) / 24);
    const localHour = (8 + h) % 24;
    const day = 13 + dayOffset;
    points.push(makeHour(`2026-05-${day}T${String(localHour).padStart(2, '0')}:00:00`));
  }
  return points;
}

describe('evaluateTreatmentWindow', () => {
  describe('Application windows', () => {
    it('returns one window covering the entire horizon when conditions are benign', () => {
      const inputForecast = makeForecast(buildBenignHorizon());
      const actualResult = evaluateTreatmentWindow({
        forecast: inputForecast,
        thresholds: DEFAULT_TREATMENT_THRESHOLDS,
        plannedDate: PLANNED_DATE,
        evaluatedAt: new Date(FETCHED_AT),
      });
      expect(actualResult.applicationWindows).toHaveLength(1);
      expect(actualResult.applicationWindows[0].from).toBe('2026-05-13T08:00:00');
      expect(actualResult.risks).toHaveLength(0);
    });
    it('excludes hours with wind above threshold from windows', () => {
      const points = buildBenignHorizon();
      points[2] = makeHour(points[2].time, { windSpeedKmh: 40 });
      const actualResult = evaluateTreatmentWindow({
        forecast: makeForecast(points),
        thresholds: DEFAULT_TREATMENT_THRESHOLDS,
        plannedDate: PLANNED_DATE,
        evaluatedAt: new Date(FETCHED_AT),
      });
      expect(actualResult.applicationWindows.length).toBeGreaterThan(1);
      const windRisk = actualResult.risks.find((r) => r.kind === 'wind');
      expect(windRisk).toBeDefined();
      expect(windRisk?.severity === 'medium' || windRisk?.severity === 'high').toBe(true);
    });
    it('excludes a window if rain falls within noRainHoursPostApplication after it', () => {
      const points = buildBenignHorizon();
      points[5] = makeHour(points[5].time, {
        precipitationMm: 1.5,
        precipitationProbabilityPercent: 80,
      });
      const actualResult = evaluateTreatmentWindow({
        forecast: makeForecast(points),
        thresholds: DEFAULT_TREATMENT_THRESHOLDS,
        plannedDate: PLANNED_DATE,
        evaluatedAt: new Date(FETCHED_AT),
      });
      expect(actualResult.applicationWindows[0]?.from).not.toBe(points[0].time);
    });
    it('returns no windows when the entire horizon is unsuitable', () => {
      const points = buildBenignHorizon().map((p) =>
        makeHour(p.time, {
          windSpeedKmh: 50,
          precipitationMm: 5,
          precipitationProbabilityPercent: 90,
        }),
      );
      const actualResult = evaluateTreatmentWindow({
        forecast: makeForecast(points),
        thresholds: DEFAULT_TREATMENT_THRESHOLDS,
        plannedDate: PLANNED_DATE,
        evaluatedAt: new Date(FETCHED_AT),
      });
      expect(actualResult.applicationWindows).toHaveLength(0);
      expect(actualResult.risks.length).toBeGreaterThan(0);
    });
  });
  describe('Risk detection', () => {
    it('flags rain risk when probability is above threshold', () => {
      const points = buildBenignHorizon();
      points[3] = makeHour(points[3].time, {
        precipitationProbabilityPercent: 85,
        precipitationMm: 2,
      });
      const actualResult = evaluateTreatmentWindow({
        forecast: makeForecast(points),
        thresholds: DEFAULT_TREATMENT_THRESHOLDS,
        plannedDate: PLANNED_DATE,
        evaluatedAt: new Date(FETCHED_AT),
      });
      const rainRisk = actualResult.risks.find((r) => r.kind === 'rain');
      expect(rainRisk).toBeDefined();
      expect(rainRisk?.message).toContain('85');
    });
    it('flags frost risk as high when temperature is at or below 0°C', () => {
      const points = buildBenignHorizon();
      points[1] = makeHour(points[1].time, { temperatureCelsius: -2 });
      const actualResult = evaluateTreatmentWindow({
        forecast: makeForecast(points),
        thresholds: DEFAULT_TREATMENT_THRESHOLDS,
        plannedDate: PLANNED_DATE,
        evaluatedAt: new Date(FETCHED_AT),
      });
      const frostRisk = actualResult.risks.find((r) => r.kind === 'frost');
      expect(frostRisk?.severity).toBe('high');
    });
    it('flags heat risk when temperature exceeds tempMax', () => {
      const points = buildBenignHorizon();
      points[10] = makeHour(points[10].time, { temperatureCelsius: 38 });
      const actualResult = evaluateTreatmentWindow({
        forecast: makeForecast(points),
        thresholds: DEFAULT_TREATMENT_THRESHOLDS,
        plannedDate: PLANNED_DATE,
        evaluatedAt: new Date(FETCHED_AT),
      });
      expect(actualResult.risks.some((r) => r.kind === 'heat')).toBe(true);
    });
    it('emits at most one risk per kind', () => {
      const points = buildBenignHorizon().map((p) =>
        makeHour(p.time, {
          windSpeedKmh: 40,
          precipitationProbabilityPercent: 80,
          precipitationMm: 3,
        }),
      );
      const actualResult = evaluateTreatmentWindow({
        forecast: makeForecast(points),
        thresholds: DEFAULT_TREATMENT_THRESHOLDS,
        plannedDate: PLANNED_DATE,
        evaluatedAt: new Date(FETCHED_AT),
      });
      const kinds = actualResult.risks.map((r) => r.kind);
      const unique = new Set(kinds);
      expect(unique.size).toBe(kinds.length);
    });
  });
  describe('Horizon handling', () => {
    it('respects custom horizonHours', () => {
      const points = buildBenignHorizon();
      points[20] = makeHour(points[20].time, { windSpeedKmh: 50 });
      const actualResult = evaluateTreatmentWindow({
        forecast: makeForecast(points),
        thresholds: DEFAULT_TREATMENT_THRESHOLDS,
        plannedDate: PLANNED_DATE,
        horizonHours: 6,
        evaluatedAt: new Date(FETCHED_AT),
      });
      expect(actualResult.risks.find((r) => r.kind === 'wind')).toBeUndefined();
    });
    it('exposes evaluatedAt and horizon bounds in the result', () => {
      const actualResult = evaluateTreatmentWindow({
        forecast: makeForecast(buildBenignHorizon()),
        thresholds: DEFAULT_TREATMENT_THRESHOLDS,
        plannedDate: PLANNED_DATE,
        horizonHours: 24,
        evaluatedAt: new Date(FETCHED_AT),
      });
      expect(actualResult.evaluatedAt).toBe(FETCHED_AT);
      expect(actualResult.horizonStart).toBeDefined();
      expect(actualResult.horizonEnd).toBeDefined();
      expect(new Date(actualResult.horizonEnd).getTime()).toBeGreaterThan(
        new Date(actualResult.horizonStart).getTime(),
      );
    });
  });
});
