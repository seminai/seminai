const mockProductFindMany = jest.fn();
const mockProductionUnitFindMany = jest.fn();
const mockProductionUnitOnFieldFindMany = jest.fn();

jest.mock('../../../../repositories/Prisma', () => ({
  prisma: {
    product: { findMany: mockProductFindMany },
    productionUnit: { findMany: mockProductionUnitFindMany },
    productionUnitOnField: { findMany: mockProductionUnitOnFieldFindMany },
  },
}));

import { createFertilizerPlanTool } from '../tools/fertilizer-plan.tool';
import { clearWorkingMemory, getWorkingMemory, updateWorkingMemory } from '../working-memory';

const FORBIDDEN_KEYS = [
  'expectedPerHa',
  'actualPerHa',
  'yieldScaleUsed',
  'resolvedCropFile',
  'Día Después',
];

const COMPANY_ID = '00000000-0000-0000-0000-000000000001';
const UNIT_ID = '00000000-0000-0000-0000-000000000010';
const FIELD_ID = '00000000-0000-0000-0000-000000000020';

const ureaFertilizer = {
  id: 'urea-id',
  name: 'Urea 46%',
  category: 'FERTILIZER',
  nitrogen: 46,
  phosphorus: 0,
  potassium: 0,
  magnesium: 0,
  calcium: 0,
  sulfur: 0,
  boron: 0,
};

const mapFertilizer = {
  id: 'map-id',
  name: 'MAP 11-52-0',
  category: 'FERTILIZER',
  nitrogen: 11,
  phosphorus: 52,
  potassium: 0,
  magnesium: 0,
  calcium: 0,
  sulfur: 0,
  boron: 0,
};

const muriateFertilizer = {
  id: 'muriate-id',
  name: 'Muriate of potash',
  category: 'FERTILIZER',
  nitrogen: 0,
  phosphorus: 0,
  potassium: 60,
  magnesium: 0,
  calcium: 0,
  sulfur: 0,
  boron: 0,
};

const calciumFertilizer = {
  id: 'calnit-id',
  name: 'Calcium Nitrate',
  category: 'FERTILIZER',
  nitrogen: 15.5,
  phosphorus: 0,
  potassium: 0,
  magnesium: 0,
  calcium: 26.5,
  sulfur: 0,
  boron: 0,
};

const magnesiumFertilizer = {
  id: 'mgsulf-id',
  name: 'Magnesium Sulphate',
  category: 'FERTILIZER',
  nitrogen: 0,
  phosphorus: 0,
  potassium: 0,
  magnesium: 16,
  calcium: 0,
  sulfur: 13,
  boron: 0,
};

const tomatoUnit = {
  id: UNIT_ID,
  name: 'Tomato Plot A',
  cycles: [
    {
      id: 'cycle-1',
      productionUnitId: UNIT_ID,
      cropName: 'pomodoro',
      cropType: 'Solanaceae',
      variety: 'San Marzano',
      protocoll: 'std',
      protectionStructure: 'open',
      floweringDate: null,
      harvestingDate: null,
      occupazione: null,
      destinazioneDiUso: null,
      acquaTotalePeridoL: 0,
      seasonYear: 2026,
      cycleIndex: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
};

describe('fertilizer_plan tool', () => {
  const threadId = 'fertilizer-plan-thread';

  beforeEach(() => {
    clearWorkingMemory(threadId);
    jest.clearAllMocks();
  });

  it('errors when no production unit can be resolved', async () => {
    const tool = createFertilizerPlanTool(threadId);
    const raw = await tool.func({});
    const parsed = JSON.parse(raw);
    expect(parsed.error).toBeDefined();
    expect(mockProductionUnitFindMany).not.toHaveBeenCalled();
  });

  it('falls back to inputUnits in working memory when productionUnitIds is omitted', async () => {
    updateWorkingMemory(threadId, {
      inputUnits: [{ id: UNIT_ID }] as unknown as never[],
    });
    mockProductionUnitOnFieldFindMany.mockResolvedValue([
      { fieldId: FIELD_ID, productionUnitId: UNIT_ID, field: { companyId: COMPANY_ID } },
    ]);
    mockProductFindMany.mockResolvedValue([
      ureaFertilizer,
      mapFertilizer,
      muriateFertilizer,
      calciumFertilizer,
      magnesiumFertilizer,
    ]);
    mockProductionUnitFindMany.mockResolvedValue([tomatoUnit]);

    const tool = createFertilizerPlanTool(threadId);
    const raw = await tool.func({});
    const parsed = JSON.parse(raw);

    expect(parsed.unitsProcessed).toBe(1);
    expect(parsed.plansPerUnit[0].cropName).toBe('pomodoro');
    expect(parsed.plansPerUnit[0].skipped).toBe(false);
    expect(parsed.plansPerUnit[0].feasible).toBe(true);
  });

  it('produces a markdown table containing the unit name, crop, and dose totals', async () => {
    mockProductionUnitOnFieldFindMany.mockResolvedValue([
      { fieldId: FIELD_ID, productionUnitId: UNIT_ID, field: { companyId: COMPANY_ID } },
    ]);
    mockProductFindMany.mockResolvedValue([
      ureaFertilizer,
      mapFertilizer,
      muriateFertilizer,
      calciumFertilizer,
      magnesiumFertilizer,
    ]);
    mockProductionUnitFindMany.mockResolvedValue([tomatoUnit]);

    const tool = createFertilizerPlanTool(threadId);
    const raw = await tool.func({ productionUnitIds: [UNIT_ID] });
    const parsed = JSON.parse(raw);

    expect(typeof parsed.markdownTable).toBe('string');
    expect(parsed.markdownTable).toContain('Piano di fertilizzazione');
    expect(parsed.markdownTable).toContain('Tomato Plot A');
    expect(parsed.markdownTable).toContain('pomodoro');
    expect(parsed.markdownTable).toContain('| Settimana |');
    expect(parsed.markdownTable).toMatch(/Urea 46%|MAP 11-52-0|Muriate of potash/);
  });

  it('NEVER leaks raw nutrient requirements, actual/expected per-ha, yield, or CSV path', async () => {
    mockProductionUnitOnFieldFindMany.mockResolvedValue([
      { fieldId: FIELD_ID, productionUnitId: UNIT_ID, field: { companyId: COMPANY_ID } },
    ]);
    mockProductFindMany.mockResolvedValue([
      ureaFertilizer,
      mapFertilizer,
      muriateFertilizer,
      calciumFertilizer,
      magnesiumFertilizer,
    ]);
    mockProductionUnitFindMany.mockResolvedValue([tomatoUnit]);

    const tool = createFertilizerPlanTool(threadId);
    const raw = await tool.func({ productionUnitIds: [UNIT_ID] });

    for (const forbidden of FORBIDDEN_KEYS) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it('marks the unit as skipped when no fertilizers are configured for the company', async () => {
    mockProductionUnitOnFieldFindMany.mockResolvedValue([
      { fieldId: FIELD_ID, productionUnitId: UNIT_ID, field: { companyId: COMPANY_ID } },
    ]);
    mockProductFindMany.mockResolvedValue([]);
    mockProductionUnitFindMany.mockResolvedValue([tomatoUnit]);

    const tool = createFertilizerPlanTool(threadId);
    const raw = await tool.func({ productionUnitIds: [UNIT_ID] });
    const parsed = JSON.parse(raw);

    expect(parsed.plansPerUnit[0].skipped).toBe(true);
    expect(parsed.plansPerUnit[0].skippedReason).toBeDefined();
    expect(parsed.markdownTable).toContain('saltata');
  });

  it('writes the sanitized plan into working memory under fertilizerPlan', async () => {
    mockProductionUnitOnFieldFindMany.mockResolvedValue([
      { fieldId: FIELD_ID, productionUnitId: UNIT_ID, field: { companyId: COMPANY_ID } },
    ]);
    mockProductFindMany.mockResolvedValue([
      ureaFertilizer,
      mapFertilizer,
      muriateFertilizer,
      calciumFertilizer,
      magnesiumFertilizer,
    ]);
    mockProductionUnitFindMany.mockResolvedValue([tomatoUnit]);

    const tool = createFertilizerPlanTool(threadId);
    await tool.func({ productionUnitIds: [UNIT_ID] });
    const wm = getWorkingMemory(threadId);

    expect(wm.fertilizerPlan).toBeDefined();
    expect(wm.fertilizerPlan?.[0].plan?.__brand).toBe('public');
  });
});
