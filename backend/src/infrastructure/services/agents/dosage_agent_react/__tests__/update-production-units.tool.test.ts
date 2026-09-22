const executeMock = jest.fn();
const findByIdMock = jest.fn();
const productionUnitFindFirstMock = jest.fn();

jest.mock('../../../../repositories/Prisma', () => ({
  prisma: {
    productionUnit: {
      findFirst: (...args: unknown[]) => productionUnitFindFirstMock(...args),
    },
  },
}));

jest.mock(
  '../../../../../application/use-cases/production-unit/UpdateProductionUnitUseCase',
  () => ({
    UpdateProductionUnitUseCase: jest.fn().mockImplementation(() => ({
      execute: executeMock,
    })),
  }),
);

jest.mock('../../../../repositories/PrismaProductionUnitRepository', () => ({
  PrismaProductionUnitRepository: jest.fn().mockImplementation(() => ({
    findById: findByIdMock,
  })),
}));

import { createUpdateProductionUnitsTool } from '../tools/update-production-units.tool';
import { clearWorkingMemory, getWorkingMemory, updateWorkingMemory } from '../working-memory';

describe('update_production_units tool', () => {
  const threadId = 'pu-update-thread';

  beforeEach(() => {
    clearWorkingMemory(threadId);
    executeMock.mockReset();
    findByIdMock.mockReset();
    productionUnitFindFirstMock.mockReset();
    productionUnitFindFirstMock.mockResolvedValue({ id: 'pu-1' });
    findByIdMock.mockResolvedValue({
      id: 'pu-1',
      name: 'Vite - Trebbiano',
      cropName: 'Vite',
      variety: 'Trebbiano',
      startDate: new Date('2026-02-17T00:00:00.000Z'),
      floweringDate: undefined,
      harvestingDate: undefined,
      endDate: new Date('2026-02-17T00:00:00.000Z'),
    });
    updateWorkingMemory(threadId, {
      inputUnits: [
        {
          id: 'pu-1',
          name: 'Vite - Trebbiano',
          companyId: 'company-1',
          companyName: 'Seminai Fruit Farm',
          cropName: 'Vite',
          variety: 'Trebbiano',
          startDate: new Date('2026-02-17T00:00:00.000Z'),
          endDate: new Date('2026-02-17T00:00:00.000Z'),
        },
      ],
    });
  });

  it('resolves units from working memory by name and updates stored dates', async () => {
    executeMock.mockResolvedValue({
      productionUnit: {
        id: 'pu-1',
        name: 'Vite - Trebbiano',
        cropName: 'Vite',
        variety: 'Trebbiano',
        startDate: new Date('2026-11-14T00:00:00.000Z'),
        floweringDate: new Date('2027-04-10T00:00:00.000Z'),
        harvestingDate: new Date('2027-08-14T00:00:00.000Z'),
        endDate: new Date('2027-08-14T00:00:00.000Z'),
      },
    });
    const tool = createUpdateProductionUnitsTool(threadId, 'user-1');

    const result = JSON.parse(
      await tool.func({
        updates: [
          {
            productionUnitName: 'Vite - Trebbiano',
            companyName: 'Seminai Fruit Farm',
            startDate: '2026-11-14',
            floweringDate: '2027-04-10',
            harvestingDate: '2027-08-14',
            endDate: '2027-08-14',
          },
        ],
        reason: 'Correzione date coerenti con la coltura',
      }),
    );

    expect(executeMock).toHaveBeenCalledWith({
      id: 'pu-1',
      data: {
        startDate: new Date('2026-11-14T00:00:00.000Z'),
        floweringDate: new Date('2027-04-10T00:00:00.000Z'),
        harvestingDate: new Date('2027-08-14T00:00:00.000Z'),
        endDate: new Date('2027-08-14T00:00:00.000Z'),
      },
    });
    expect(result.updatedCount).toBe(1);
    expect(result.updatedUnits[0].id).toBe('pu-1');

    const updatedMemory = getWorkingMemory(threadId).inputUnits as Array<{
      id: string;
      startDate?: Date;
      endDate?: Date;
    }>;
    expect(updatedMemory[0].startDate?.toISOString()).toBe('2026-11-14T00:00:00.000Z');
    expect(updatedMemory[0].endDate?.toISOString()).toBe('2027-08-14T00:00:00.000Z');
  });

  it('rejects updates for production units outside the user scope', async () => {
    productionUnitFindFirstMock.mockResolvedValue(null);
    const tool = createUpdateProductionUnitsTool(threadId, 'user-1');

    const result = JSON.parse(
      await tool.func({
        updates: [
          {
            productionUnitName: 'Vite - Trebbiano',
            companyName: 'Seminai Fruit Farm',
            startDate: '2026-11-14',
          },
        ],
        reason: 'Correzione data',
      }),
    );

    expect(result.error).toContain('non autorizzata');
    expect(executeMock).not.toHaveBeenCalled();
    expect(productionUnitFindFirstMock).toHaveBeenCalledWith({
      where: {
        id: 'pu-1',
        productionUnitsOnFields: {
          some: { field: { company: { companyUsers: { some: { userId: 'user-1' } } } } },
        },
      },
      select: { id: true },
    });
  });
});
