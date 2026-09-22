import { OpenMeteoService } from '../infrastructure/services/integrations/open-meteo/OpenMeteoService';
import type { OpenMeteoApiResponse } from '../infrastructure/services/integrations/open-meteo/types';

function buildApiResponse(overrides: Partial<OpenMeteoApiResponse> = {}): OpenMeteoApiResponse {
  return {
    latitude: 45.4,
    longitude: 11.9,
    timezone: 'Europe/Rome',
    utc_offset_seconds: 3600,
    hourly: {
      time: ['2026-05-13T08:00', '2026-05-13T09:00'],
      temperature_2m: [14.2, 16.7],
      precipitation: [0.0, 0.1],
      precipitation_probability: [10, 15],
      wind_speed_10m: [8.4, 9.1],
      wind_gusts_10m: [14.2, 15.0],
      relative_humidity_2m: [62, 58],
    },
    ...overrides,
  };
}

function buildFetchMock(response: OpenMeteoApiResponse): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(response),
  });
}

describe('OpenMeteoService', () => {
  describe('URL construction', () => {
    it('encodes all required parameters with explicit units and timezone=auto', async () => {
      const inputApi = buildApiResponse();
      const fetchMock = buildFetchMock(inputApi);
      const service = new OpenMeteoService({ fetchImpl: fetchMock as unknown as typeof fetch });
      await service.fetchForecast({ latitude: 45.4, longitude: 11.9, forecastDays: 3 });
      const calledUrl = (fetchMock.mock.calls[0]?.[0] ?? '') as string;
      expect(calledUrl).toContain('latitude=45.4');
      expect(calledUrl).toContain('longitude=11.9');
      expect(calledUrl).toContain('wind_speed_unit=kmh');
      expect(calledUrl).toContain('temperature_unit=celsius');
      expect(calledUrl).toContain('precipitation_unit=mm');
      expect(calledUrl).toContain('timezone=auto');
      expect(calledUrl).toContain('forecast_days=3');
      expect(calledUrl).toContain('temperature_2m');
      expect(calledUrl).toContain('precipitation_probability');
      expect(calledUrl).toContain('wind_speed_10m');
    });
    it('clamps forecast_days to [1, 7]', async () => {
      const fetchMock = buildFetchMock(buildApiResponse());
      const service = new OpenMeteoService({ fetchImpl: fetchMock as unknown as typeof fetch });
      await service.fetchForecast({ latitude: 0, longitude: 0, forecastDays: 14 });
      await service.fetchForecast({ latitude: 0, longitude: 0, forecastDays: 0 });
      const url1 = (fetchMock.mock.calls[0]?.[0] ?? '') as string;
      const url2 = (fetchMock.mock.calls[1]?.[0] ?? '') as string;
      expect(url1).toContain('forecast_days=7');
      expect(url2).toContain('forecast_days=1');
    });
  });
  describe('Response normalization', () => {
    it('maps raw hourly arrays into typed WeatherHourlyPoint objects', async () => {
      const fetchMock = buildFetchMock(buildApiResponse());
      const service = new OpenMeteoService({ fetchImpl: fetchMock as unknown as typeof fetch });
      const actualForecast = await service.fetchForecast({
        latitude: 45.4,
        longitude: 11.9,
        forecastDays: 1,
      });
      if (!actualForecast.available) throw new Error('expected available forecast');
      expect(actualForecast.hourly).toHaveLength(2);
      expect(actualForecast.hourly[0]).toMatchObject({
        time: '2026-05-13T08:00',
        temperatureCelsius: 14.2,
        precipitationMm: 0.0,
        precipitationProbabilityPercent: 10,
        windSpeedKmh: 8.4,
        windGustsKmh: 14.2,
        relativeHumidityPercent: 62,
      });
      expect(actualForecast.timezone).toBe('Europe/Rome');
      expect(actualForecast.utcOffsetSeconds).toBe(3600);
    });
  });
  describe('Cache', () => {
    it('returns cached result for the same lat/lon/days within TTL', async () => {
      const fetchMock = buildFetchMock(buildApiResponse());
      const service = new OpenMeteoService({
        fetchImpl: fetchMock as unknown as typeof fetch,
        cacheTtlMs: 60_000,
      });
      await service.fetchForecast({ latitude: 45.4, longitude: 11.9, forecastDays: 3 });
      await service.fetchForecast({ latitude: 45.4, longitude: 11.9, forecastDays: 3 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it('rounds lat/lon to 2 decimals when computing the cache key', async () => {
      const fetchMock = buildFetchMock(buildApiResponse());
      const service = new OpenMeteoService({
        fetchImpl: fetchMock as unknown as typeof fetch,
        cacheTtlMs: 60_000,
      });
      await service.fetchForecast({ latitude: 45.401, longitude: 11.901, forecastDays: 3 });
      await service.fetchForecast({ latitude: 45.404, longitude: 11.904, forecastDays: 3 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it('refetches after TTL expires', async () => {
      const fetchMock = buildFetchMock(buildApiResponse());
      let now = 1000;
      const service = new OpenMeteoService({
        fetchImpl: fetchMock as unknown as typeof fetch,
        cacheTtlMs: 60_000,
        now: () => now,
      });
      await service.fetchForecast({ latitude: 45.4, longitude: 11.9, forecastDays: 3 });
      now += 70_000;
      await service.fetchForecast({ latitude: 45.4, longitude: 11.9, forecastDays: 3 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
  describe('Fail-soft', () => {
    it('returns {available:false} when the API responds with non-2xx', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({}) });
      const service = new OpenMeteoService({ fetchImpl: fetchMock as unknown as typeof fetch });
      const actualForecast = await service.fetchForecast({
        latitude: 0,
        longitude: 0,
        forecastDays: 1,
      });
      expect(actualForecast.available).toBe(false);
      if (actualForecast.available) return;
      expect(actualForecast.reason).toContain('503');
    });
    it('returns {available:false} on network errors instead of throwing', async () => {
      const fetchMock = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const service = new OpenMeteoService({ fetchImpl: fetchMock as unknown as typeof fetch });
      const actualForecast = await service.fetchForecast({
        latitude: 0,
        longitude: 0,
        forecastDays: 1,
      });
      expect(actualForecast.available).toBe(false);
      if (actualForecast.available) return;
      expect(actualForecast.reason).toContain('ECONNREFUSED');
    });
    it('does not cache an unavailable result (next call retries)', async () => {
      const fetchMock = jest
        .fn()
        .mockRejectedValueOnce(new Error('flaky'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(buildApiResponse()),
        });
      const service = new OpenMeteoService({ fetchImpl: fetchMock as unknown as typeof fetch });
      const first = await service.fetchForecast({ latitude: 1, longitude: 2, forecastDays: 1 });
      const second = await service.fetchForecast({ latitude: 1, longitude: 2, forecastDays: 1 });
      expect(first.available).toBe(false);
      expect(second.available).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
