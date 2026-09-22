import { OpenMeteoService } from '../infrastructure/services/integrations/open-meteo/OpenMeteoService';
import { evaluateTreatmentWindow } from '../domain/services/treatment-weather/treatment-window-evaluator';
import { DEFAULT_TREATMENT_THRESHOLDS } from '../domain/services/treatment-weather/thresholds';

const PADOVA_LATITUDE = 45.4064;
const PADOVA_LONGITUDE = 11.8768;

describe('Open-Meteo Integration (real HTTP)', () => {
  describe('OpenMeteoService against api.open-meteo.com', () => {
    it('returns a normalized forecast with the requested units and Italian timezone', async () => {
      const service = new OpenMeteoService();
      const actualForecast = await service.fetchForecast({
        latitude: PADOVA_LATITUDE,
        longitude: PADOVA_LONGITUDE,
        forecastDays: 3,
      });
      expect(actualForecast.available).toBe(true);
      if (!actualForecast.available) return;
      expect(actualForecast.timezone.startsWith('Europe/')).toBe(true);
      expect(actualForecast.utcOffsetSeconds).toBeGreaterThanOrEqual(0);
      expect(actualForecast.hourly.length).toBeGreaterThanOrEqual(24);
      const sample = actualForecast.hourly[0];
      expect(typeof sample.temperatureCelsius).toBe('number');
      expect(typeof sample.windSpeedKmh).toBe('number');
      expect(typeof sample.precipitationProbabilityPercent).toBe('number');
      expect(sample.relativeHumidityPercent).toBeGreaterThanOrEqual(0);
      expect(sample.relativeHumidityPercent).toBeLessThanOrEqual(100);
      expect(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(sample.time)).toBe(true);
    }, 15_000);
    it('caches forecasts for the same coordinates within TTL', async () => {
      const service = new OpenMeteoService({ cacheTtlMs: 60_000 });
      const first = await service.fetchForecast({
        latitude: PADOVA_LATITUDE,
        longitude: PADOVA_LONGITUDE,
        forecastDays: 1,
      });
      const second = await service.fetchForecast({
        latitude: PADOVA_LATITUDE,
        longitude: PADOVA_LONGITUDE,
        forecastDays: 1,
      });
      expect(first.available).toBe(true);
      expect(second.available).toBe(true);
      if (first.available && second.available) {
        expect(second.fetchedAt).toBe(first.fetchedAt);
      }
    }, 15_000);
    it('fails soft on aggressive timeout and never throws', async () => {
      const service = new OpenMeteoService({ timeoutMs: 1 });
      const actualForecast = await service.fetchForecast({
        latitude: PADOVA_LATITUDE,
        longitude: PADOVA_LONGITUDE,
        forecastDays: 1,
      });
      expect(actualForecast.available).toBe(false);
      if (actualForecast.available) return;
      expect(actualForecast.reason.length).toBeGreaterThan(0);
    }, 5_000);
  });
  describe('Service + Evaluator pipeline', () => {
    it('produces a coherent application-window verdict from a real forecast', async () => {
      const service = new OpenMeteoService();
      const inputForecast = await service.fetchForecast({
        latitude: PADOVA_LATITUDE,
        longitude: PADOVA_LONGITUDE,
        forecastDays: 2,
      });
      expect(inputForecast.available).toBe(true);
      if (!inputForecast.available) return;
      const plannedDate = inputForecast.hourly[0].time;
      const actualResult = evaluateTreatmentWindow({
        forecast: inputForecast,
        thresholds: DEFAULT_TREATMENT_THRESHOLDS,
        plannedDate,
        horizonHours: 24,
      });
      expect(Array.isArray(actualResult.applicationWindows)).toBe(true);
      expect(Array.isArray(actualResult.risks)).toBe(true);
      const horizonStart = new Date(actualResult.horizonStart).getTime();
      const horizonEnd = new Date(actualResult.horizonEnd).getTime();
      expect(horizonEnd - horizonStart).toBe(24 * 60 * 60 * 1000);
      const allowedKinds = new Set(['rain', 'wind', 'frost', 'heat', 'humidity']);
      for (const risk of actualResult.risks) {
        expect(allowedKinds.has(risk.kind)).toBe(true);
        expect(['low', 'medium', 'high']).toContain(risk.severity);
      }
      const horizonPoints = inputForecast.hourly.filter((p) => {
        const t = new Date(p.time).getTime();
        return t >= horizonStart && t < horizonEnd;
      });
      const observedRain = horizonPoints.some(
        (p) =>
          p.precipitationProbabilityPercent >
            DEFAULT_TREATMENT_THRESHOLDS.rainProbabilityMaxPercent ||
          p.precipitationMm > DEFAULT_TREATMENT_THRESHOLDS.precipitationMaxMmPerHour,
      );
      const reportedRain = actualResult.risks.some((r) => r.kind === 'rain');
      expect(reportedRain).toBe(observedRain);
    }, 15_000);
  });
});
