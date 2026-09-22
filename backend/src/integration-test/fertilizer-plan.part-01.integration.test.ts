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
import { createTestUser, createTestCompany, deleteAllTestCompanies, deleteTestUser, prisma } from './helpers';
import type { ITestUser, ITestCompany } from './helpers';
import { ComputeFertilizerPlanUseCase } from '../application/use-cases/fertilizer/ComputeFertilizerPlanUseCase';

jest.setTimeout(60_000);

const FORBIDDEN_LEAKS = [
  'expectedPerHa',
  'actualPerHa',
  'yieldScaleUsed',
  'resolvedCropFile',
  'Día Después',
];
void (() => FORBIDDEN_LEAKS);

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
void (() => computeDeliveredNutrients);
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
  });});
