import { PrismaClient } from '@prisma/client';
import { PrismaArchiveDeletionRepository } from '../infrastructure/repositories/PrismaArchiveDeletionRepository';

interface ModelMock {
  readonly findMany: jest.Mock;
  readonly deleteMany: jest.Mock;
  readonly updateMany: jest.Mock;
}

interface TxMock {
  readonly field: ModelMock;
  readonly productionUnit: ModelMock;
  readonly product: ModelMock;
  readonly job: ModelMock;
  readonly fieldNote: ModelMock;
  readonly fieldNoteAttachment: Pick<ModelMock, 'deleteMany'>;
  readonly stock: Pick<ModelMock, 'deleteMany'>;
  readonly productionCycle: Pick<ModelMock, 'deleteMany'>;
  readonly productionUnitOnField: Pick<ModelMock, 'deleteMany'>;
  readonly fileExtraction: Pick<ModelMock, 'deleteMany'>;
  readonly emailAttachment: Pick<ModelMock, 'updateMany'>;
  readonly file: Pick<ModelMock, 'deleteMany'>;
}

describe('PrismaArchiveDeletionRepository', () => {
  it('deletes products and stocks for Magazzino while keeping warehouses', async () => {
    const { repository, tx } = createRepository();
    tx.product.findMany.mockResolvedValue([{ id: 'product-1' }, { id: 'product-2' }]);
    tx.stock.deleteMany.mockResolvedValueOnce({ count: 3 });
    tx.product.deleteMany.mockResolvedValue({ count: 2 });

    const actual = await repository.deleteBulk({
      ids: [],
      companyId: 'company-1',
      cascade: { productsAll: true },
    });

    expect(tx.product.findMany).toHaveBeenCalledWith({
      where: { warehouse: { companyId: 'company-1' } },
      select: { id: true },
    });
    expect(tx.stock.deleteMany).toHaveBeenCalledWith({
      where: { productId: { in: ['product-1', 'product-2'] } },
    });
    expect(actual.deletedProducts).toBe(2);
    expect(actual.deletedStocksByCompany).toBe(3);
  });

  it('deletes fields and production units when both cascades are selected', async () => {
    const { repository, tx } = createRepository();
    tx.field.findMany.mockResolvedValue([{ id: 'field-1' }]);
    tx.productionUnit.findMany.mockResolvedValue([{ id: 'unit-1' }]);
    tx.field.deleteMany.mockResolvedValue({ count: 1 });
    tx.productionUnit.deleteMany.mockResolvedValue({ count: 1 });

    const actual = await repository.deleteBulk({
      ids: [],
      companyId: 'company-1',
      cascade: { fields: true, productionUnits: true },
    });

    expect(tx.productionUnit.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['unit-1'] } },
    });
    expect(tx.field.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['field-1'] } },
    });
    expect(actual.deletedProductionUnits).toBe(1);
    expect(actual.deletedFields).toBe(1);
  });
});

function createRepository(): {
  readonly repository: PrismaArchiveDeletionRepository;
  readonly tx: TxMock;
} {
  const tx = createTx();
  const prisma = {
    $transaction: jest.fn(async (callback: (transaction: TxMock) => Promise<unknown>) =>
      callback(tx),
    ),
  } as unknown as PrismaClient;
  return { repository: new PrismaArchiveDeletionRepository(prisma), tx };
}

function createTx(): TxMock {
  return {
    field: createModel(),
    productionUnit: createModel(),
    product: createModel(),
    job: createModel(),
    fieldNote: createModel(),
    fieldNoteAttachment: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    stock: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    productionCycle: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    productionUnitOnField: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    fileExtraction: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    emailAttachment: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    file: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
}

function createModel(): ModelMock {
  return {
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
}
