import { LIVE_TEST_CHAT_MODEL } from './live-llm-test-config';
/**
 * Integration tests for the dosage_agent_react fixes triggered by the
 * 2026-05-19 production bug (chat e1620fa7-…) where the agent looped on
 * search_products and never produced a dosage plan.
 *
 * Fix 1: list_company_products productIndex must include registrationNumber
 *        so the LLM can pass it to downstream tools (search_products).
 * Fix 2: list_production_units unitIndex must include the UUID id so the LLM
 *        does not hallucinate `id: "0"`.
 * Fix 3: a single @company mention must be promoted to WM.currentCompanyId
 *        and list_* tools must default companyId from WM when not provided.
 *
 * Sezioni Fix 1 e Fix 2 NON usano LLM: invocano i tool direttamente con DB
 * reale (Postgres locale). La sezione Fix 3 fa un E2E completo con LLM reale
 * (richiede OPENROUTER_API_KEY).
 *
 * Per eseguire:
 *   npm run test:int:llm -- --testPathPattern dosage-react-agent-mention-bug
 */

import { randomUUID } from 'crypto';
import { createListCompanyProductsTool } from '../infrastructure/services/agents/dosage_agent_react/tools/list-company-products.tool';
import { createListProductionUnitsTool } from '../infrastructure/services/agents/dosage_agent_react/tools/list-production-units.tool';
import {
  clearWorkingMemory,
  getWorkingMemory,
} from '../infrastructure/services/agents/dosage_agent_react/working-memory';
import { streamReactAgent } from '../infrastructure/services/agents/dosage_agent_react/streaming';
import type { StreamEvent } from '../infrastructure/services/agents/dosage_agent_react/type/events';
import { createTestUser, createTestCompany, deleteTestCompany, prisma } from './helpers';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

jest.setTimeout(120000);

interface SeededProduct {
  readonly id: string;
  readonly name: string;
  readonly registrationNumber: string;
}

interface SeededProductionUnit {
  readonly id: string;
  readonly fieldId: string;
  readonly cropName: string;
  readonly areaHa: number;
}

interface SeedResult {
  readonly userId: string;
  readonly companyId: string;
  readonly warehouseId: string;
  readonly products: ReadonlyArray<SeededProduct>;
  readonly productionUnits: ReadonlyArray<SeededProductionUnit>;
}

const SAMPLE_PRODUCTS: ReadonlyArray<{ name: string; registrationNumber: string }> = [
  { name: 'ZOLVIS OTTANTA WG', registrationNumber: '11890' },
  { name: 'FANTIC F WG', registrationNumber: '15549' },
  { name: 'ALIETTE', registrationNumber: '13567' },
  { name: 'PROFILER', registrationNumber: '14802' },
  { name: 'KARATHANE', registrationNumber: '16910' },
];

async function seedCompanyWithProducts(
  companyName: string,
  options: { readonly withProductionUnit?: boolean } = {},
): Promise<SeedResult> {
  const user = await createTestUser();
  const company = await createTestCompany({
    userId: user.id,
    name: companyName,
  });

  const warehouse = await prisma.warehouse.create({
    data: {
      companyId: company.id,
      name: 'Magazzino Test',
      address: 'Via Test 1',
      sezione: 'A',
      foglio: '1',
      particella: '1',
    },
  });

  const products: SeededProduct[] = [];
  for (const sample of SAMPLE_PRODUCTS) {
    const product = await prisma.product.create({
      data: {
        name: sample.name,
        sku: `SKU-${sample.registrationNumber}`,
        registrationNumber: sample.registrationNumber,
        category: 'PESTICIDE',
        type: 'FUNGICIDE',
        warehouseId: warehouse.id,
      },
    });
    await prisma.stock.create({
      data: {
        productId: product.id,
        quantity: 25,
        unitOfMeasureQuantity: 'kg',
        price: 0,
        unitOfMeasurePrice: 'kg',
        type: 'IN',
      },
    });
    products.push({
      id: product.id,
      name: product.name,
      registrationNumber: sample.registrationNumber,
    });
  }

  const productionUnits: SeededProductionUnit[] = [];
  if (options.withProductionUnit) {
    const field = await prisma.field.create({
      data: {
        companyId: company.id,
        name: 'Campo Vite Test',
        sauHa: 29.796,
        gisHa: 29.796,
        city: 'Treviso',
        region: 'Veneto',
      },
    });
    const productionUnit = await prisma.productionUnit.create({
      data: {
        name: 'UP Vite',
        areaHa: 29.796,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
      },
    });
    await prisma.productionUnitOnField.create({
      data: {
        fieldId: field.id,
        productionUnitId: productionUnit.id,
        areaHaOnField: 29.796,
      },
    });
    await prisma.productionCycle.create({
      data: {
        productionUnitId: productionUnit.id,
        cropName: 'Vite',
        cropType: 'PERENNE',
        variety: 'Glera',
        protocoll: '',
        protectionStructure: '',
        acquaTotalePeridoL: 0,
        seasonYear: 2025,
        cycleIndex: 0,
      },
    });
    productionUnits.push({
      id: productionUnit.id,
      fieldId: field.id,
      cropName: 'Vite',
      areaHa: 29.796,
    });
  }

  return {
    userId: user.id,
    companyId: company.id,
    warehouseId: warehouse.id,
    products,
    productionUnits,
  };
}

describe('dosage_agent_react — mention/companyId/registrationNumber bug fixes', () => {
  // ─────────────────────────────────────────────────────────────────────
  // Fix 1 — list_company_products productIndex exposes registrationNumber
  // ─────────────────────────────────────────────────────────────────────
  describe('Fix 1 — list_company_products productIndex includes registrationNumber', () => {
    const threadId = `fix1-${randomUUID()}`;
    let seed: SeedResult;

    beforeAll(async () => {
      seed = await seedCompanyWithProducts('Giacomo Della Rosa Test Fix1');
    });

    afterAll(async () => {
      clearWorkingMemory(threadId);
      if (seed) await deleteTestCompany(seed.companyId);
    });

    it('returns registrationNumber for every product in productIndex', async () => {
      const tool = createListCompanyProductsTool(threadId, seed.userId);

      const raw = (await tool.func({ companyId: seed.companyId })) as string;
      const parsed = JSON.parse(raw);

      expect(parsed.productsFound).toBe(SAMPLE_PRODUCTS.length);
      expect(parsed.productsWithStock).toBe(SAMPLE_PRODUCTS.length);
      expect(parsed.productIndex).toHaveLength(SAMPLE_PRODUCTS.length);

      for (const entry of parsed.productIndex as Array<{
        idx: number;
        name: string;
        registrationNumber: string;
      }>) {
        expect(typeof entry.registrationNumber).toBe('string');
        expect(entry.registrationNumber.length).toBeGreaterThan(0);
      }

      const expectedRegNumbers = SAMPLE_PRODUCTS.map((p) => p.registrationNumber).sort();
      const actualRegNumbers = (parsed.productIndex as Array<{ registrationNumber: string }>)
        .map((p) => p.registrationNumber)
        .sort();
      expect(actualRegNumbers).toEqual(expectedRegNumbers);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Fix 2 — list_production_units unitIndex exposes UUID id
  // ─────────────────────────────────────────────────────────────────────
  describe('Fix 2 — list_production_units unitIndex includes UUID id', () => {
    const threadId = `fix2-${randomUUID()}`;
    let seed: SeedResult;

    beforeAll(async () => {
      seed = await seedCompanyWithProducts('Giacomo Della Rosa Test Fix2', {
        withProductionUnit: true,
      });
    });

    afterAll(async () => {
      clearWorkingMemory(threadId);
      if (seed) await deleteTestCompany(seed.companyId);
    });

    it('returns UUID id (not the idx) for every entry in unitIndex', async () => {
      const tool = createListProductionUnitsTool(threadId, seed.userId);

      const raw = (await tool.func({ companyId: seed.companyId })) as string;
      const parsed = JSON.parse(raw);

      expect(parsed.unitsFound).toBe(1);
      expect(parsed.unitIndex).toHaveLength(1);

      const entry = parsed.unitIndex[0] as { idx: number; id: string; crop: string };
      expect(typeof entry.id).toBe('string');
      expect(entry.id).toMatch(UUID_REGEX);
      expect(entry.id).not.toBe(String(entry.idx));
      expect(entry.id).toBe(seed.productionUnits[0].id);
      expect(entry.crop).toBe('Vite');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Fix 3 — WM promotion before LLM (does NOT require LLM quota)
  // ─────────────────────────────────────────────────────────────────────
  describe('Fix 3 — @company mention is promoted to WM.currentCompanyId before LLM call', () => {
    const threadId = `fix3-wm-${randomUUID()}`;
    let seed: SeedResult;

    beforeAll(async () => {
      seed = await seedCompanyWithProducts('Giacomo Della Rosa Test Fix3 WM', {
        withProductionUnit: true,
      });
    });

    afterAll(async () => {
      clearWorkingMemory(threadId);
      if (seed) await deleteTestCompany(seed.companyId);
    });

    it('writes companyId to WorkingMemory before the LLM is invoked', async () => {
      // The WM write at streaming.ts happens synchronously BEFORE app.stream()
      // is awaited. So we abort the externalSignal immediately: the generator
      // body runs up to the WM write, then the aborted signal cancels the LLM
      // call. Test stays fast and does not burn OpenAI quota.
      const controller = new AbortController();
      controller.abort();
      const stream = streamReactAgent({
        threadId,
        userId: seed.userId,
        userMessage:
          'genera piano dosaggi con tutto il magazzino su tutti i campi, rispetta limiti di stock',
        modelName: LIVE_TEST_CHAT_MODEL,
        mentions: [
          {
            type: 'company',
            id: seed.companyId,
            label: 'Giacomo Della Rosa Test Fix3 WM',
          },
        ],
        externalSignal: controller.signal,
      });
      try {
        for await (const _event of stream) void _event;
      } catch {
        // AbortError from the stream is expected; ignore.
      }

      expect(getWorkingMemory(threadId).currentCompanyId).toBe(seed.companyId);
    }, 30_000);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Fix 3 — Full E2E with real LLM: replay of the production bug scenario
  // ─────────────────────────────────────────────────────────────────────
  describe('Fix 3 — full E2E: @company mention drives dosage plan flow (real LLM)', () => {
    const threadId = `fix3-e2e-${randomUUID()}`;
    let seed: SeedResult;

    beforeAll(async () => {
      if (!process.env.OPENROUTER_API_KEY) return;
      seed = await seedCompanyWithProducts('Giacomo Della Rosa Test Fix3 E2E', {
        withProductionUnit: true,
      });
    });

    afterAll(async () => {
      clearWorkingMemory(threadId);
      if (seed) await deleteTestCompany(seed.companyId);
    });

    it('avoids search_products loop and produces a dosage plan (skips on LLM quota errors)', async () => {
      if (!process.env.OPENROUTER_API_KEY) {
        console.log('⚠️  Skipping Fix 3 E2E: OPENROUTER_API_KEY not available');
        return;
      }

      const events: StreamEvent[] = [];
      const stream = streamReactAgent({
        threadId,
        userId: seed.userId,
        userMessage:
          'genera piano dosaggi con tutto il magazzino su tutti i campi, rispetta limiti di stock',
        modelName: LIVE_TEST_CHAT_MODEL,
        mentions: [
          {
            type: 'company',
            id: seed.companyId,
            label: 'Giacomo Della Rosa Test Fix3 E2E',
          },
        ],
      });
      for await (const event of stream) events.push(event);

      // Soft-skip on upstream LLM quota / rate-limit errors: the agent never
      // got to invoke any tool so we can't validate the chain. Surface as a
      // warning so the operator notices, but do not fail the suite.
      const llmInfraError = events.find(
        (e) =>
          e.type === 'error' &&
          typeof e.error === 'string' &&
          /429|quota|rate limit|RATE_LIMIT/i.test(e.error),
      );
      if (llmInfraError) {
        console.warn(
          '⚠️  Skipping Fix 3 E2E asserts (4-6): LLM provider returned a quota/rate-limit error.',
        );
        return;
      }

      // Assert 1 — no search_products loop (original bug: 3 identical calls)
      const searchProductsCalls = events.filter(
        (e) => e.type === 'tool_call' && e.toolCall?.name === 'search_products',
      );
      expect(searchProductsCalls.length).toBeLessThanOrEqual(1);

      // Assert 2 — if search_products was called, args carry valid registrationNumbers + UUID unit ids
      if (searchProductsCalls.length === 1) {
        const args = searchProductsCalls[0].toolCall!.args as {
          products?: Array<{ registrationNumber?: string }>;
          unitOfProduction?: Array<{ id?: string }>;
        };
        expect(Array.isArray(args.products)).toBe(true);
        expect((args.products ?? []).length).toBeGreaterThan(0);
        for (const product of args.products ?? []) {
          expect(typeof product.registrationNumber).toBe('string');
          expect((product.registrationNumber ?? '').length).toBeGreaterThan(0);
        }
        for (const unit of args.unitOfProduction ?? []) {
          expect(unit.id).toMatch(UUID_REGEX);
        }
      }

      // Assert 3 — tool chain reached the list_* discovery tools
      const toolNames = events.filter((e) => e.type === 'tool_call').map((e) => e.toolCall!.name);
      expect(toolNames).toEqual(
        expect.arrayContaining(['list_company_products', 'list_production_units']),
      );

      // Assert 4 — final response does NOT hallucinate "missing registration numbers"
      const completeEvent = events.find((e) => e.type === 'complete');
      const finalMessage =
        (completeEvent && 'message' in completeEvent
          ? (completeEvent as { message?: string }).message
          : undefined) ??
        events
          .filter((e) => e.type === 'token')
          .map((e) => (e.content ?? '') as string)
          .join('');
      expect(finalMessage).not.toMatch(/missing registration|numeri di registrazione mancanti/i);

      // Assert 5 — sanity cost: bugged production run cost $0.66; healthy must be cheaper
      const cost =
        completeEvent && 'cost' in completeEvent
          ? (completeEvent as { cost?: { totalCostUsd?: number } }).cost
          : undefined;
      if (cost?.totalCostUsd !== undefined) {
        expect(cost.totalCostUsd).toBeLessThan(0.5);
      }
    }, 600_000);
  });
});
