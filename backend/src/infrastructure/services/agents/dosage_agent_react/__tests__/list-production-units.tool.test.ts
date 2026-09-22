const mockFindMany = jest.fn();
const mockCompanyFindFirst = jest.fn();

jest.mock('../../../../repositories/Prisma', () => ({
  prisma: {
    productionUnitOnField: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    company: {
      findFirst: (...args: unknown[]) => mockCompanyFindFirst(...args),
    },
  },
}));

import { createListProductionUnitsTool } from '../tools/list-production-units.tool';
import { clearWorkingMemory, getWorkingMemory, updateWorkingMemory } from '../working-memory';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface TestUnitRow {
  readonly productionUnit: {
    readonly id: string;
    readonly name: string;
    readonly areaHa: number;
    readonly startDate: Date | null;
    readonly endDate: Date | null;
    readonly cycles: ReadonlyArray<{
      readonly cropName: string;
      readonly cropType: string;
      readonly variety: string;
      readonly protocoll: string | null;
      readonly floweringDate: Date | null;
      readonly harvestingDate: Date | null;
    }>;
  };
  readonly field: {
    readonly id: string;
    readonly name: string;
    readonly city: string | null;
    readonly region: string | null;
    readonly sauHa: number | null;
    readonly gisHa: number | null;
    readonly company: { readonly id: string; readonly name: string } | null;
  };
  readonly areaHaOnField: number;
}

function buildUnit(index: number, companyId: string, companyName: string): TestUnitRow {
  return {
    productionUnit: {
      id: `b136f881-e358-4bbf-8674-1b47c14d8a${String(index).padStart(2, '0')}`,
      name: `UP Vite ${index}`,
      areaHa: 10 + index,
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      cycles: [
        {
          cropName: 'Vite',
          cropType: 'PERENNE',
          variety: 'Glera',
          protocoll: null,
          floweringDate: null,
          harvestingDate: null,
        },
      ],
    },
    field: {
      id: `00000000-0000-0000-0000-fff00000000${index}`,
      name: `Field ${index}`,
      city: 'Treviso',
      region: 'Veneto',
      sauHa: 12,
      gisHa: 12,
      company: { id: companyId, name: companyName },
    },
    areaHaOnField: 10 + index,
  };
}

describe('list_production_units tool', () => {
  const threadId = 'list-production-units-thread';
  const userId = 'user-1';
  const companyId = '00000000-0000-0000-0000-000000000001';
  const companyName = 'Giacomo Della Rosa';

  beforeEach(() => {
    clearWorkingMemory(threadId);
    jest.clearAllMocks();
    mockCompanyFindFirst.mockResolvedValue(null);
  });

  it('exposes UUID id for every entry in unitIndex (not the idx)', async () => {
    const units = [buildUnit(1, companyId, companyName), buildUnit(2, companyId, companyName)];
    mockFindMany.mockResolvedValue(units);
    const tool = createListProductionUnitsTool(threadId, userId);

    const result = JSON.parse(await tool.func({ companyId }));

    expect(result.unitsFound).toBe(2);
    expect(result.unitIndex).toHaveLength(2);
    for (const entry of result.unitIndex as Array<{ idx: number; id: string }>) {
      expect(typeof entry.id).toBe('string');
      expect(entry.id).toMatch(UUID_REGEX);
      expect(entry.id).not.toBe(String(entry.idx));
    }
    expect((result.unitIndex as Array<{ id: string }>).map((u) => u.id).sort()).toEqual(
      units.map((u) => u.productionUnit.id).sort(),
    );
  });

  it('defaults companyId from wm.currentCompanyId when not provided in args', async () => {
    updateWorkingMemory(threadId, { currentCompanyId: companyId });
    const units = [buildUnit(1, companyId, companyName)];
    mockFindMany.mockResolvedValue(units);
    const tool = createListProductionUnitsTool(threadId, userId);

    const result = JSON.parse(await tool.func({}));

    expect(result.unitsFound).toBe(1);
    const call = mockFindMany.mock.calls[0][0];
    expect(call.where.field.companyId).toBe(companyId);
  });

  it('preserves id after dedup by production unit id', async () => {
    const duplicated = buildUnit(1, companyId, companyName);
    mockFindMany.mockResolvedValue([duplicated, duplicated, buildUnit(2, companyId, companyName)]);
    const tool = createListProductionUnitsTool(threadId, userId);

    const result = JSON.parse(await tool.func({ companyId }));

    expect(result.unitsFound).toBe(2);
    const ids = (result.unitIndex as Array<{ id: string }>).map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);

    const memory = getWorkingMemory(threadId).inputUnits as Array<{
      id: string;
      region?: string;
      city?: string;
      disciplinari?: string[];
    }>;
    expect(memory).toHaveLength(2);
    expect(memory.map((u) => u.id).sort()).toEqual(ids.sort());
    expect(memory[0]).toEqual(
      expect.objectContaining({
        region: 'Veneto',
        city: 'Treviso',
        disciplinari: ['Veneto'],
      }),
    );
  });

  it('blocks downstream planning when a filtered company has no production units', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCompanyFindFirst.mockResolvedValue({
      id: companyId,
      name: companyName,
      _count: { fields: 0 },
    });
    const tool = createListProductionUnitsTool(threadId, userId);

    const result = JSON.parse(await tool.func({ companyName }));

    expect(result.unitsFound).toBe(0);
    expect(result.blocked).toBe(true);
    expect(result.message).toContain(`Azienda "${companyName}" trovata`);
    expect(result.message).toContain('Non inventare unità produttive');
    expect(result.hint).toContain('Non procedere con search_products');
    expect(result.unitIndex).toEqual([]);
  });
});
