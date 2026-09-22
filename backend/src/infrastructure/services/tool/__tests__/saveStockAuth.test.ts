/**
 * Unit tests for the company authorization gate added to the three stock
 * save tools (PR-A of P2). Each tool must reject before opening any DB write
 * when the caller has no access to the target company.
 */
import { saveStockInPurchase } from '../saveStockInPurchase';
import { saveStockInHarvest } from '../saveStockInHarvest';
import { saveStockOutSale } from '../saveStockOutSale';
import { assertCompanyAccess } from '../../agents/shared/authorization';

jest.mock('../../agents/shared/authorization', () => ({
  assertCompanyAccess: jest.fn(),
  assertFieldAccess: jest.fn().mockResolvedValue(undefined),
  assertFieldsAccess: jest.fn().mockResolvedValue(undefined),
  assertProductionUnitAccess: jest.fn().mockResolvedValue(undefined),
  assertProductionUnitsAccess: jest.fn().mockResolvedValue(undefined),
}));

const mockedAssertCompanyAccess = assertCompanyAccess as jest.MockedFunction<
  typeof assertCompanyAccess
>;

function buildPrismaStub() {
  return {
    warehouse: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };
}

describe('saveStock* — company authorization gate (PR-A)', () => {
  beforeEach(() => {
    mockedAssertCompanyAccess.mockReset();
  });

  it('saveStockInPurchase: foreign companyId rejects before touching DB', async () => {
    mockedAssertCompanyAccess.mockRejectedValueOnce(
      new Error('Azienda non trovata o non autorizzata per questo utente.'),
    );
    const prisma = buildPrismaStub();

    await expect(
      saveStockInPurchase('user-1', prisma as never, {
        companyId: 'foreign-co',
        productName: 'Rame',
        quantity: 10,
        unitOfMeasureQuantity: 'kg',
        rawContent: 'compra rame',
      }),
    ).rejects.toThrow(/Azienda non trovata o non autorizzata/);
    expect(mockedAssertCompanyAccess).toHaveBeenCalledWith('user-1', 'foreign-co');
    expect(prisma.warehouse.findMany).not.toHaveBeenCalled();
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('saveStockInHarvest: foreign companyId rejects before touching DB', async () => {
    mockedAssertCompanyAccess.mockRejectedValueOnce(
      new Error('Azienda non trovata o non autorizzata per questo utente.'),
    );
    const prisma = buildPrismaStub();

    await expect(
      saveStockInHarvest('user-1', prisma as never, {
        companyId: 'foreign-co',
        cropName: 'frumento',
        quantity: 100,
        unitOfMeasureQuantity: 't',
        rawContent: 'raccolto frumento',
      }),
    ).rejects.toThrow(/Azienda non trovata o non autorizzata/);
    expect(mockedAssertCompanyAccess).toHaveBeenCalledWith('user-1', 'foreign-co');
    expect(prisma.warehouse.findMany).not.toHaveBeenCalled();
  });

  it('saveStockOutSale: foreign company resolved from productId rejects', async () => {
    mockedAssertCompanyAccess.mockRejectedValueOnce(
      new Error('Azienda non trovata o non autorizzata per questo utente.'),
    );
    const prisma = buildPrismaStub();
    // Forged productId points at a warehouse of another tenant
    prisma.product.findUnique = jest.fn().mockResolvedValue({
      id: 'product-1',
      warehouse: { companyId: 'foreign-co' },
    });

    await expect(
      saveStockOutSale('user-1', prisma as never, {
        productId: 'product-1',
        quantity: 5,
        unitOfMeasureQuantity: 'kg',
        rawContent: 'venduta partita',
      }),
    ).rejects.toThrow(/Azienda non trovata o non autorizzata/);
    expect(mockedAssertCompanyAccess).toHaveBeenCalledWith('user-1', 'foreign-co');
  });
});
