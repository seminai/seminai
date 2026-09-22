import {
  WeatherAdvisorService,
  computeContextHash,
  type AdviseForInput,
} from '../infrastructure/services/agents/weather_advisor/WeatherAdvisorService';
import type {
  AgronomistCacheSavePayload,
  CachedAgronomistAdvice,
  IWeatherAdvisorCacheRepository,
} from '../domain/repositories/IWeatherAdvisorCacheRepository';
import type { AgronomistAdviceJson } from '../infrastructure/services/agents/weather_advisor/agronomist-advice.schema';

function buildLlmJson(
  overrides: Partial<AgronomistAdviceJson['thresholds']> = {},
): AgronomistAdviceJson {
  return {
    thresholds: {
      windMaxKmh: 18,
      rainProbabilityMaxPercent: 25,
      precipitationMaxMmPerHour: 0.1,
      tempMinCelsius: 8,
      tempMaxCelsius: 30,
      humidityMaxPercent: 92,
      humidityMinPercent: 45,
      noRainHoursPostApplication: 8,
      ...overrides,
    },
    reasoning: 'Stub agronomist reasoning for tests with sufficient length to satisfy schema.',
    confidence: 'high',
  };
}

function buildCacheRepo(initial: CachedAgronomistAdvice | null = null): {
  repo: IWeatherAdvisorCacheRepository;
  saveSpy: jest.Mock<Promise<void>, [AgronomistCacheSavePayload]>;
  findSpy: jest.Mock<Promise<CachedAgronomistAdvice | null>, [string]>;
} {
  const findSpy = jest
    .fn<Promise<CachedAgronomistAdvice | null>, [string]>()
    .mockResolvedValue(initial);
  const saveSpy = jest.fn<Promise<void>, [AgronomistCacheSavePayload]>().mockResolvedValue();
  return {
    repo: { findByContextHash: findSpy, save: saveSpy },
    saveSpy,
    findSpy,
  };
}

const SAMPLE_INPUT: AdviseForInput = {
  products: [
    {
      sku: 'SKU-001',
      name: 'Cuprozinco 35 WG',
      category: 'PESTICIDE',
      type: 'Fungicida',
      labelCategoria: 'Fungicida (WG)',
    },
  ],
  machine: { name: 'Atomizzatore Padano AP-12', identifier: 'ATM-PD-12' },
};

describe('WeatherAdvisorService', () => {
  describe('Cache behavior', () => {
    it('returns the cached advice without invoking the LLM when a cache hit is found', async () => {
      const cached: CachedAgronomistAdvice = {
        contextHash: computeContextHash(SAMPLE_INPUT),
        thresholds: buildLlmJson().thresholds,
        reasoning: 'Cached reasoning',
        confidence: 'medium',
        sourceModel: 'gpt-4o-mini',
      };
      const { repo, saveSpy } = buildCacheRepo(cached);
      const llmCaller = jest.fn();
      const service = new WeatherAdvisorService({ cacheRepo: repo, llmCaller: llmCaller as never });
      const result = await service.adviseFor(SAMPLE_INPUT);
      expect(result.source).toBe('cache');
      expect(result.thresholds).toEqual(cached.thresholds);
      expect(result.confidence).toBe('medium');
      expect(result.sourceModel).toBe('gpt-4o-mini');
      expect(llmCaller).not.toHaveBeenCalled();
      expect(saveSpy).not.toHaveBeenCalled();
    });
    it('invokes the LLM and persists to cache on cache miss', async () => {
      const { repo, saveSpy } = buildCacheRepo(null);
      const json = buildLlmJson();
      const llmCaller = jest
        .fn()
        .mockResolvedValue({ json, sourceModel: 'claude-sonnet-4-20250514' });
      const service = new WeatherAdvisorService({ cacheRepo: repo, llmCaller });
      const result = await service.adviseFor(SAMPLE_INPUT);
      expect(result.source).toBe('agronomist-llm');
      expect(result.thresholds).toEqual(json.thresholds);
      expect(result.confidence).toBe('high');
      expect(result.sourceModel).toBe('claude-sonnet-4-20250514');
      expect(llmCaller).toHaveBeenCalledTimes(1);
      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(saveSpy.mock.calls[0][0]).toMatchObject({
        contextHash: result.contextHash,
        sourceModel: 'claude-sonnet-4-20250514',
        confidence: 'high',
      });
    });
  });
  describe('Fallback on LLM failure', () => {
    it('returns DEFAULT_TREATMENT_THRESHOLDS with warning when the LLM throws', async () => {
      const { repo, saveSpy } = buildCacheRepo(null);
      const llmCaller = jest.fn().mockRejectedValue(new Error('Anthropic 503'));
      const service = new WeatherAdvisorService({ cacheRepo: repo, llmCaller });
      const result = await service.adviseFor(SAMPLE_INPUT);
      expect(result.source).toBe('default-fallback');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.join(' ')).toContain('Anthropic 503');
      expect(result.thresholds.windMaxKmh).toBe(20);
      expect(saveSpy).not.toHaveBeenCalled();
    });
  });
  describe('Context hash determinism', () => {
    it('returns the same hash for the same input', () => {
      const hash1 = computeContextHash(SAMPLE_INPUT);
      const hash2 = computeContextHash(SAMPLE_INPUT);
      expect(hash1).toBe(hash2);
    });
    it('returns the same hash regardless of product order', () => {
      const a: AdviseForInput = {
        products: [
          { sku: 'A', name: 'Prod A', category: 'PESTICIDE' },
          { sku: 'B', name: 'Prod B', category: 'PESTICIDE' },
        ],
      };
      const b: AdviseForInput = {
        products: [
          { sku: 'B', name: 'Prod B', category: 'PESTICIDE' },
          { sku: 'A', name: 'Prod A', category: 'PESTICIDE' },
        ],
      };
      expect(computeContextHash(a)).toBe(computeContextHash(b));
    });
    it('returns different hash when machine changes', () => {
      const noMachine = { ...SAMPLE_INPUT, machine: undefined };
      expect(computeContextHash(SAMPLE_INPUT)).not.toBe(computeContextHash(noMachine));
    });
    it('returns different hash when product SKU changes', () => {
      const altered: AdviseForInput = {
        ...SAMPLE_INPUT,
        products: [{ ...SAMPLE_INPUT.products[0], sku: 'SKU-OTHER' }],
      };
      expect(computeContextHash(SAMPLE_INPUT)).not.toBe(computeContextHash(altered));
    });
    it('returns the same hash even with different name (only sku/category/type/labelCategoria matter)', () => {
      const altered: AdviseForInput = {
        ...SAMPLE_INPUT,
        products: [{ ...SAMPLE_INPUT.products[0], name: 'Different display name' }],
      };
      expect(computeContextHash(SAMPLE_INPUT)).toBe(computeContextHash(altered));
    });
  });
});
