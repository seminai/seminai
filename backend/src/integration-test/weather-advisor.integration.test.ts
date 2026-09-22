import { prisma } from './setup';
import { PrismaWeatherAdvisorCacheRepository } from '../infrastructure/repositories/PrismaWeatherAdvisorCacheRepository';
import {
  WeatherAdvisorService,
  computeContextHash,
} from '../infrastructure/services/agents/weather_advisor/WeatherAdvisorService';
import type { AdviseForInput } from '../infrastructure/services/agents/weather_advisor/WeatherAdvisorService';

const hasLlmKey = Boolean(process.env.OPENROUTER_API_KEY);
const describeIfLlm = hasLlmKey ? describe : describe.skip;

const FUNGICIDE_INPUT: AdviseForInput = {
  products: [
    {
      sku: 'TEST-FUNG-01',
      name: 'TestFungicideRame WG (integration test)',
      category: 'PESTICIDE',
      type: 'Fungicida',
      labelCategoria: 'Fungicida (WG)',
    },
  ],
  machine: { name: 'Atomizzatore TestRig AT-1', identifier: 'TST-ATM-01' },
};

const HERBICIDE_INPUT: AdviseForInput = {
  products: [
    {
      sku: 'TEST-HERB-01',
      name: 'TestErbicidaSelettivo SC (integration test)',
      category: 'PESTICIDE',
      type: 'Erbicida',
      labelCategoria: 'Erbicida sistemico (SC)',
    },
  ],
  machine: { name: 'Barra TestRig BT-1', identifier: 'TST-BAR-01' },
};

async function clearCacheForInputs(inputs: AdviseForInput[]): Promise<void> {
  for (const input of inputs) {
    await prisma.weatherAdvisorCache.deleteMany({
      where: { contextHash: computeContextHash(input) },
    });
  }
}

describeIfLlm('WeatherAdvisor — real LLM + DB cache', () => {
  jest.setTimeout(120_000);
  let service: WeatherAdvisorService;

  beforeAll(async () => {
    service = new WeatherAdvisorService({
      cacheRepo: new PrismaWeatherAdvisorCacheRepository(prisma),
    });
  });

  beforeEach(async () => {
    await clearCacheForInputs([FUNGICIDE_INPUT, HERBICIDE_INPUT]);
  });

  afterAll(async () => {
    await clearCacheForInputs([FUNGICIDE_INPUT, HERBICIDE_INPUT]);
  });

  describe('Real LLM threshold reasoning', () => {
    it('returns plausible thresholds for a fungicide treatment with atomizer', async () => {
      const advice = await service.adviseFor(FUNGICIDE_INPUT);
      expect(advice.source).toBe('agronomist-llm');
      expect(advice.thresholds.windMaxKmh).toBeGreaterThanOrEqual(5);
      expect(advice.thresholds.windMaxKmh).toBeLessThanOrEqual(40);
      expect(advice.thresholds.tempMinCelsius).toBeLessThan(advice.thresholds.tempMaxCelsius);
      expect(advice.thresholds.humidityMinPercent).toBeLessThan(
        advice.thresholds.humidityMaxPercent,
      );
      expect(advice.thresholds.noRainHoursPostApplication).toBeGreaterThanOrEqual(2);
      expect(advice.thresholds.noRainHoursPostApplication).toBeLessThanOrEqual(24);
      expect(advice.reasoning).toBeDefined();
      expect((advice.reasoning ?? '').length).toBeGreaterThan(20);
      expect(['high', 'medium', 'low']).toContain(advice.confidence);
    });
    it('returns plausible thresholds for a herbicide treatment with bar sprayer', async () => {
      const advice = await service.adviseFor(HERBICIDE_INPUT);
      expect(advice.source).toBe('agronomist-llm');
      expect(advice.thresholds.windMaxKmh).toBeGreaterThanOrEqual(5);
      expect(advice.thresholds.windMaxKmh).toBeLessThanOrEqual(40);
      expect((advice.reasoning ?? '').length).toBeGreaterThan(20);
    });
  });

  describe('DB cache hit/miss', () => {
    it('persists the LLM advice and reuses it on the second call (cache hit)', async () => {
      const first = await service.adviseFor(FUNGICIDE_INPUT);
      expect(first.source).toBe('agronomist-llm');
      const persisted = await prisma.weatherAdvisorCache.findUnique({
        where: { contextHash: first.contextHash },
      });
      expect(persisted).not.toBeNull();
      expect(persisted?.sourceModel).toBeTruthy();
      const second = await service.adviseFor(FUNGICIDE_INPUT);
      expect(second.source).toBe('cache');
      expect(second.thresholds).toEqual(first.thresholds);
      expect(second.reasoning).toBe(first.reasoning);
      expect(second.contextHash).toBe(first.contextHash);
    });
    it('uses different cache entries for different product mixes', async () => {
      const fungAdvice = await service.adviseFor(FUNGICIDE_INPUT);
      const herbAdvice = await service.adviseFor(HERBICIDE_INPUT);
      expect(fungAdvice.contextHash).not.toBe(herbAdvice.contextHash);
      const both = await prisma.weatherAdvisorCache.findMany({
        where: { contextHash: { in: [fungAdvice.contextHash, herbAdvice.contextHash] } },
      });
      expect(both).toHaveLength(2);
    });
  });

  describe('Fallback when LLM provider fails', () => {
    it('returns DEFAULT_TREATMENT_THRESHOLDS + warning when injected llmCaller throws', async () => {
      const repo = new PrismaWeatherAdvisorCacheRepository(prisma);
      const failingService = new WeatherAdvisorService({
        cacheRepo: repo,
        llmCaller: async () => {
          throw new Error('Simulated LLM outage for test');
        },
      });
      const advice = await failingService.adviseFor(FUNGICIDE_INPUT);
      expect(advice.source).toBe('default-fallback');
      expect(advice.warnings.join(' ')).toContain('Simulated LLM outage');
      expect(advice.thresholds.windMaxKmh).toBe(20);
    });
  });
});
