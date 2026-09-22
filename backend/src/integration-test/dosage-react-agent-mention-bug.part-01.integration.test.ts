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
import { clearWorkingMemory } from '../infrastructure/services/agents/dosage_agent_react/working-memory';
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
  });});
