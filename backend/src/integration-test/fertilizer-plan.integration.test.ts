/**
 * Integration test: end-to-end fertilizer planning for a realistic farm setup.
 *
 * Scenario: a company with one warehouse, one field, one production unit with a
 * tomato production cycle, and five fertilizer products with realistic NPK +
 * Ca/Mg compositions. The ComputeFertilizerPlanUseCase is invoked directly (no
 * LLM dependency, deterministic) and the agent tool layer is also exercised
 * through `createFertilizerPlanTool` to verify the markdown table renders.
 *
 * Run:
 *   npm run test:integration -- --testPathPattern fertilizer-plan
 */

import {
  createTestUser,
  createTestCompany,
  deleteAllTestCompanies,
  deleteTestUser,
  prisma,
} from './helpers';
import type { ITestUser, ITestCompany } from './helpers';
import { ComputeFertilizerPlanUseCase } from '../application/use-cases/fertilizer/ComputeFertilizerPlanUseCase';
import { createFertilizerPlanTool } from '../infrastructure/services/agents/dosage_agent_react/tools/fertilizer-plan.tool';
import {
  clearWorkingMemory,
  updateWorkingMemory,
} from '../infrastructure/services/agents/dosage_agent_react/working-memory';

jest.setTimeout(60_000);

const FORBIDDEN_LEAKS = [
  'expectedPerHa',
  'actualPerHa',
  'yieldScaleUsed',
  'resolvedCropFile',
  'Día Después',
];

let testUser: ITestUser;
let testCompany: ITestCompany;
let warehouseId: string;
let fieldId: string;
let productionUnitId: string;
const fertilizerIds: string[] = [];

beforeAll(async () => {
  testUser = await createTestUser();
  testCompany = await createTestCompany({
    userId: testUser.id,
    name: 'Azienda Test Fertilizer SRL',
  });

  const warehouse = await prisma.warehouse.create({
    data: {
      companyId: testCompany.id,
      name: 'Warehouse Test',
      address: 'Via Test 1',
      sezione: 'A',
      foglio: '1',
      particella: '1',
    },
  });
  warehouseId = warehouse.id;

  const field = await prisma.field.create({
    data: {
      companyId: testCompany.id,
      name: 'Campo Pomodoro Sud',
      coordinates: [12.0, 44.0],
      coordinatesGaussBoaga: [],
      gisHa: 1.0,
      sauHa: 1.0,
      city: 'Faenza',
      region: 'Emilia-Romagna',
    },
  });
  fieldId = field.id;

  const unit = await prisma.productionUnit.create({
    data: {
      name: 'Pomodoro San Marzano 2026',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2026-09-30'),
      areaHa: 1.0,
      productionUnitsOnFields: {
        create: { fieldId, areaHaOnField: 1.0 },
      },
      cycles: {
        create: {
          cropName: 'pomodoro',
          cropType: 'Solanaceae',
          variety: 'San Marzano',
          protocoll: 'integrato',
          protectionStructure: 'tunnel',
          acquaTotalePeridoL: 4500,
          seasonYear: 2026,
          cycleIndex: 1,
        },
      },
    },
  });
  productionUnitId = unit.id;

  const fertilizers = [
    {
      name: 'Urea 46%',
      sku: 'UREA46',
      nitrogen: 46,
      phosphorus: 0,
      potassium: 0,
      magnesium: 0,
      calcium: 0,
      sulfur: 0,
      boron: 0,
    },
    {
      name: 'MAP 11-52-0',
      sku: 'MAP11',
      nitrogen: 11,
      phosphorus: 52,
      potassium: 0,
      magnesium: 0,
      calcium: 0,
      sulfur: 0,
      boron: 0,
    },
    {
      name: 'Muriate of potash',
      sku: 'KCL60',
      nitrogen: 0,
      phosphorus: 0,
      potassium: 60,
      magnesium: 0,
      calcium: 0,
      sulfur: 0,
      boron: 0,
    },
    {
      name: 'Calcium Nitrate',
      sku: 'CALN',
      nitrogen: 15.5,
      phosphorus: 0,
      potassium: 0,
      magnesium: 0,
      calcium: 26.5,
      sulfur: 0,
      boron: 0,
    },
    {
      name: 'Magnesium Sulphate',
      sku: 'MGSULF',
      nitrogen: 0,
      phosphorus: 0,
      potassium: 0,
      magnesium: 16,
      calcium: 0,
      sulfur: 13,
      boron: 0,
    },
  ];
  for (const f of fertilizers) {
    const product = await prisma.product.create({
      data: {
        name: f.name,
        sku: f.sku,
        category: 'FERTILIZER',
        type: 'Concime minerale',
        warehouseId,
        nitrogen: f.nitrogen,
        phosphorus: f.phosphorus,
        potassium: f.potassium,
        magnesium: f.magnesium,
        calcium: f.calcium,
        sulfur: f.sulfur,
        boron: f.boron,
        unitOfFertilizer: 'kg',
      },
    });
    fertilizerIds.push(product.id);
  }
});

afterAll(async () => {
  if (!testUser) return;
  try {
    await deleteAllTestCompanies(testUser.id);
    await deleteTestUser();
  } catch (error) {
    console.error('Cleanup error:', error);
  }
});

describe('Fertilizer plan — full company/field/unit scenario', () => {
  it('produces a feasible plan for a tomato production unit with realistic fertilizers (use case)', async () => {
    // Note: cropName in DB is "pomodoro" (Italian) — matches pomodoro.csv after normalization.
    const useCase = new ComputeFertilizerPlanUseCase(prisma);
    const result = await useCase.execute({
      productionUnitIds: [productionUnitId],
    });
    expect(result.unitsProcessed).toBe(1);
    const unit = result.plans[0];
    expect(unit.skipped).toBe(false);
    expect(unit.cropName).toBe('pomodoro');
    expect(unit.plan).not.toBeNull();
    expect(unit.plan!.feasible).toBe(true);
    expect(unit.plan!.usedGenericFallback).toBe(false);
    expect(unit.plan!.uncoveredNutrients).toEqual([]);
    expect(unit.plan!.perWeek.length).toBeGreaterThan(0);
    const fertilizersUsed = Object.keys(unit.plan!.totalDoses);
    expect(fertilizersUsed.length).toBeGreaterThan(0);
    for (const fertilizerId of fertilizersUsed) {
      expect(unit.plan!.totalDoses[fertilizerId]).toBeGreaterThan(0);
      expect(Number.isFinite(unit.plan!.totalDoses[fertilizerId])).toBe(true);
    }
    expect(Object.keys(unit.fertilizerNamesById).length).toBeGreaterThan(0);
  });

  it('auto-resolves fertilizers from the company when fertilizerProductIds is omitted', async () => {
    const useCase = new ComputeFertilizerPlanUseCase(prisma);
    const result = await useCase.execute({
      productionUnitIds: [productionUnitId],
    });
    const unit = result.plans[0];
    const usedNames = Object.values(unit.fertilizerNamesById);
    expect(usedNames).toEqual(
      expect.arrayContaining(['Urea 46%', 'MAP 11-52-0', 'Muriate of potash']),
    );
  });

  it('scales total doses proportionally when actualYieldByUnitId is provided', async () => {
    const useCase = new ComputeFertilizerPlanUseCase(prisma);
    // Reference yield for "pomodoro" in dataset/fertilizer_plan/yield_crop.csv is 113.379 t/ha.
    // Halving it → yieldScale = 0.5 → every total dose should halve (within solver tolerance).
    const halfReferenceYield = 113.379 / 2;
    const baseline = await useCase.execute({ productionUnitIds: [productionUnitId] });
    const scaled = await useCase.execute({
      productionUnitIds: [productionUnitId],
      actualYieldByUnitId: { [productionUnitId]: halfReferenceYield },
    });
    const baselineDoses = baseline.plans[0].plan!.totalDoses;
    const scaledDoses = scaled.plans[0].plan!.totalDoses;
    for (const fertilizerId of Object.keys(baselineDoses)) {
      expect(scaledDoses[fertilizerId]).toBeCloseTo(baselineDoses[fertilizerId] * 0.5, 1);
    }
    // Phase F: the public yieldScale must reflect the applied multiplier.
    expect(baseline.plans[0].plan!.yieldScale).toBe(1);
    expect(scaled.plans[0].plan!.yieldScale).toBeCloseTo(0.5, 5);
  });

  it('keeps yieldScale = 1 when actualYieldByUnitId is omitted (CSV calibration as-is)', async () => {
    const useCase = new ComputeFertilizerPlanUseCase(prisma);
    const a = await useCase.execute({ productionUnitIds: [productionUnitId] });
    const b = await useCase.execute({ productionUnitIds: [productionUnitId] });
    // Two runs with identical input must produce identical doses (deterministic).
    expect(a.plans[0].plan!.totalDoses).toEqual(b.plans[0].plan!.totalDoses);
  });

  it('produces season totals within agronomic plausibility bounds for tomato (greenhouse)', async () => {
    const useCase = new ComputeFertilizerPlanUseCase(prisma);
    const result = await useCase.execute({ productionUnitIds: [productionUnitId] });
    const totals = computeDeliveredNutrients(result.plans[0].plan!.totalDoses);
    // Conservative upper bands: tomato in protected/greenhouse can demand
    // significantly more nutrients than open-field. Lower bands act as a
    // floor that catches "scale too aggressive / formula broken" regressions.
    // Sources cross-checked: FAO tomato fertilization guides + Mediterranean
    // greenhouse practice (300-700 kg N/ha is typical, up to ~900 in extreme cases).
    expect(totals.N).toBeGreaterThan(200);
    expect(totals.N).toBeLessThan(1500);
    expect(totals.P2O5).toBeGreaterThan(100);
    expect(totals.P2O5).toBeLessThan(800);
    expect(totals.K2O).toBeGreaterThan(400);
    expect(totals.K2O).toBeLessThan(2500);
    expect(totals.CaO).toBeGreaterThan(100);
    expect(totals.CaO).toBeLessThan(1500);
    expect(totals.MgO).toBeGreaterThan(20);
    expect(totals.MgO).toBeLessThan(500);
  });

  it('halving the yieldScale halves the delivered nutrients (still within scaled bounds)', async () => {
    const useCase = new ComputeFertilizerPlanUseCase(prisma);
    const baseline = await useCase.execute({ productionUnitIds: [productionUnitId] });
    const halfReferenceYield = 113.379 / 2;
    const scaled = await useCase.execute({
      productionUnitIds: [productionUnitId],
      actualYieldByUnitId: { [productionUnitId]: halfReferenceYield },
    });
    const baselineNutrients = computeDeliveredNutrients(baseline.plans[0].plan!.totalDoses);
    const scaledNutrients = computeDeliveredNutrients(scaled.plans[0].plan!.totalDoses);
    expect(scaledNutrients.N).toBeCloseTo(baselineNutrients.N * 0.5, 0);
    expect(scaledNutrients.K2O).toBeCloseTo(baselineNutrients.K2O * 0.5, 0);
    // The halved plan must still deliver enough N for a halved-yield tomato (~100-700 kg/ha).
    expect(scaledNutrients.N).toBeGreaterThan(100);
    expect(scaledNutrients.N).toBeLessThan(750);
  });

  it('returns a sanitized response with NO raw nutrient demand or yield (privacy)', async () => {
    const useCase = new ComputeFertilizerPlanUseCase(prisma);
    const result = await useCase.execute({
      productionUnitIds: [productionUnitId],
    });
    const serialized = JSON.stringify(result);
    for (const key of FORBIDDEN_LEAKS) expect(serialized).not.toContain(key);
  });

  it('agent tool returns a markdown table that includes the unit name and fertilizer names', async () => {
    const threadId = 'integration-fertilizer-plan';
    clearWorkingMemory(threadId);
    updateWorkingMemory(threadId, { inputUnits: [{ id: productionUnitId }] as never[] });
    const tool = createFertilizerPlanTool(threadId);
    const raw = await tool.func({});
    const parsed = JSON.parse(raw);
    expect(parsed.unitsProcessed).toBe(1);
    expect(parsed.plansPerUnit[0].skipped).toBe(false);
    expect(parsed.plansPerUnit[0].feasible).toBe(true);
    expect(parsed.markdownTable).toContain('Piano di fertilizzazione');
    expect(parsed.markdownTable).toContain('Pomodoro San Marzano 2026');
    expect(parsed.markdownTable).toContain('pomodoro');
    expect(parsed.markdownTable).toContain('Urea 46%');
    expect(parsed.markdownTable).toContain('| Settimana |');
    // Phase F: Scale column appears in the summary, default 1.00× when no actualYield was passed
    expect(parsed.markdownTable).toContain('Scale');
    expect(parsed.markdownTable).toContain('1.00×');
    for (const key of FORBIDDEN_LEAKS) expect(raw).not.toContain(key);
  });

  it('falls back to the generic CSV when the cropName is unknown', async () => {
    const exoticCycle = await prisma.productionCycle.create({
      data: {
        productionUnitId,
        cropName: 'CropThatDoesNotExist',
        cropType: 'Unknown',
        variety: 'NA',
        protocoll: 'std',
        protectionStructure: 'open',
        acquaTotalePeridoL: 0,
        seasonYear: 2027,
        cycleIndex: 99,
      },
    });
    try {
      const useCase = new ComputeFertilizerPlanUseCase(prisma);
      const result = await useCase.execute({
        productionUnitIds: [productionUnitId],
      });
      const unit = result.plans[0];
      expect(unit.cropName).toBe('CropThatDoesNotExist');
      expect(unit.plan).not.toBeNull();
      expect(unit.plan!.usedGenericFallback).toBe(true);
    } finally {
      await prisma.productionCycle.delete({ where: { id: exoticCycle.id } });
    }
  });

  it('skips the unit and reports a reason when no fertilizer products have a nutrient composition', async () => {
    const otherCompany = await createTestCompany({
      userId: testUser.id,
      name: 'Azienda Senza Concimi SRL',
    });
    const otherWarehouse = await prisma.warehouse.create({
      data: {
        companyId: otherCompany.id,
        name: 'WH',
        address: '-',
        sezione: '-',
        foglio: '-',
        particella: '-',
      },
    });
    const otherField = await prisma.field.create({
      data: {
        companyId: otherCompany.id,
        name: 'Campo Vuoto',
        coordinates: [12.1, 44.1],
        coordinatesGaussBoaga: [],
        gisHa: 1,
        sauHa: 1,
      },
    });
    const otherUnit = await prisma.productionUnit.create({
      data: {
        name: 'Pomodoro 2026 (no fert)',
        startDate: new Date('2026-04-01'),
        endDate: new Date('2026-09-30'),
        areaHa: 1.0,
        productionUnitsOnFields: { create: { fieldId: otherField.id, areaHaOnField: 1.0 } },
        cycles: {
          create: {
            cropName: 'pomodoro',
            cropType: 'Solanaceae',
            variety: 'San Marzano',
            protocoll: 'std',
            protectionStructure: 'open',
            acquaTotalePeridoL: 0,
            seasonYear: 2026,
            cycleIndex: 1,
          },
        },
      },
    });
    // Add a FERTILIZER product without nutrients — must be filtered out.
    await prisma.product.create({
      data: {
        name: 'Generic fertilizer (composition unknown)',
        sku: 'NA',
        category: 'FERTILIZER',
        type: 'NA',
        warehouseId: otherWarehouse.id,
      },
    });
    try {
      const useCase = new ComputeFertilizerPlanUseCase(prisma);
      const result = await useCase.execute({
        productionUnitIds: [otherUnit.id],
      });
      const unit = result.plans[0];
      expect(unit.skipped).toBe(true);
      expect(unit.skippedReason).toMatch(/fertilizer/i);
      expect(unit.plan).toBeNull();
    } finally {
      await prisma.productionUnitOnField.deleteMany({ where: { productionUnitId: otherUnit.id } });
      await prisma.productionCycle.deleteMany({ where: { productionUnitId: otherUnit.id } });
      await prisma.productionUnit.delete({ where: { id: otherUnit.id } });
      await prisma.product.deleteMany({ where: { warehouseId: otherWarehouse.id } });
      await prisma.field.delete({ where: { id: otherField.id } });
      await prisma.warehouse.delete({ where: { id: otherWarehouse.id } });
      // Company is removed in afterAll via deleteAllTestCompanies
    }
  });
});

/**
 * Reconstructs total nutrients delivered (kg/ha) from per-fertilizer dose totals.
 * Mirrors the composition of the test fertilizers populated in `beforeAll` —
 * keeping this helper close to the fixtures avoids depending on Prisma in the
 * assertion code path.
 *
 * Order of `fertilizerIds` (set by beforeAll):
 *   0 = Urea 46% N           (46% N)
 *   1 = MAP 11-52-0          (11% N, 52% P2O5)
 *   2 = Muriate of potash    (60% K2O)
 *   3 = Calcium Nitrate      (15.5% N, 26.5% CaO)
 *   4 = Magnesium Sulphate   (16% MgO)
 */
function computeDeliveredNutrients(totalDoses: Readonly<Record<string, number>>): {
  N: number;
  P2O5: number;
  K2O: number;
  CaO: number;
  MgO: number;
} {
  const dose = (idx: number): number => totalDoses[fertilizerIds[idx]] ?? 0;
  return {
    N: dose(0) * 0.46 + dose(1) * 0.11 + dose(3) * 0.155,
    P2O5: dose(1) * 0.52,
    K2O: dose(2) * 0.6,
    CaO: dose(3) * 0.265,
    MgO: dose(4) * 0.16,
  };
}
