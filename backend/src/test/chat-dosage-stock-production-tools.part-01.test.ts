import { ProductCategory } from '@prisma/client';
import { createSearchCompanyStockTool } from '../infrastructure/services/agents/chat_dosage_agent/tools-stock-production';
import { prisma } from '../infrastructure/repositories/Prisma';

jest.mock('../infrastructure/repositories/Prisma', () => ({
  prisma: {
    userOnCompany: { findMany: jest.fn() },
    product: { findMany: jest.fn() },
    productionUnit: { findMany: jest.fn() },
    productionUnitOnField: { findMany: jest.fn() },
  },
}));

jest.mock('../infrastructure/services/agents/shared/llmAgronomicMatcher', () => ({
  llmMatchAgronomicNames: jest.fn(async ({ nameA, nameB }: { nameA: string; nameB: string }) => {
    const normalizedNameA = nameA.toLowerCase();
    const normalizedNameB = nameB.toLowerCase();
    return { isMatch: normalizedNameA.includes(normalizedNameB) };
  }),
}));
describe('createSearchCompanyStockTool', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns formatted stock list for user with products', async () => {
    const tool = createSearchCompanyStockTool('user-1');

    jest
      .spyOn(prisma.userOnCompany, 'findMany')
      .mockResolvedValue([{ userId: 'user-1', companyId: 'company-1', role: 'ADMIN' }] as never);

    jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Captano 80 WG',
        category: ProductCategory.PESTICIDE,
        registrationNumber: 'REG-001',
        stocks: [
          { quantity: 100, unitOfMeasureQuantity: 'kg', type: 'CARICO' },
          { quantity: 30, unitOfMeasureQuantity: 'kg', type: 'SCARICO' },
        ],
        warehouse: {
          name: 'Magazzino Principale',
          company: { name: 'Azienda Rossi' },
        },
      },
      {
        id: 'prod-2',
        name: 'Rame Caffaro',
        category: ProductCategory.PESTICIDE,
        registrationNumber: 'REG-002',
        stocks: [{ quantity: 50, unitOfMeasureQuantity: 'L', type: 'IN' }],
        warehouse: {
          name: 'Magazzino Principale',
          company: { name: 'Azienda Rossi' },
        },
      },
    ] as never);

    const result = await tool.invoke({});

    expect(result).toContain('Prodotti in magazzino (2)');
    expect(result).toContain('Captano 80 WG');
    expect(result).toContain('Rame Caffaro');
    expect(result).toContain('Azienda Rossi');
    expect(result).toContain('Giacenza: 70 kg');
    expect(result).toContain('Giacenza: 50 L');
    expect(result).toContain('Reg: REG-001');
  });

  it('returns message when user has no companies', async () => {
    const tool = createSearchCompanyStockTool('user-no-company');

    jest.spyOn(prisma.userOnCompany, 'findMany').mockResolvedValue([]);

    const result = await tool.invoke({});

    expect(result).toBe('Nessuna azienda trovata per questo utente.');
  });

  it('returns message when no products match filters', async () => {
    const tool = createSearchCompanyStockTool('user-1');

    jest
      .spyOn(prisma.userOnCompany, 'findMany')
      .mockResolvedValue([{ userId: 'user-1', companyId: 'company-1', role: 'ADMIN' }] as never);

    jest.spyOn(prisma.product, 'findMany').mockResolvedValue([]);

    const result = await tool.invoke({ searchTerm: 'prodotto-inesistente' });

    expect(result).toBe('Nessun prodotto trovato con i filtri specificati.');
  });

  it('filters out products with zero or negative net stock', async () => {
    const tool = createSearchCompanyStockTool('user-1');

    jest
      .spyOn(prisma.userOnCompany, 'findMany')
      .mockResolvedValue([{ userId: 'user-1', companyId: 'company-1', role: 'ADMIN' }] as never);

    jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Esaurito',
        category: ProductCategory.PESTICIDE,
        registrationNumber: null,
        stocks: [
          { quantity: 10, unitOfMeasureQuantity: 'kg', type: 'CARICO' },
          { quantity: 10, unitOfMeasureQuantity: 'kg', type: 'SCARICO' },
        ],
        warehouse: {
          name: 'Magazzino',
          company: { name: 'Azienda' },
        },
      },
      {
        id: 'prod-2',
        name: 'Disponibile',
        category: ProductCategory.FERTILIZER,
        registrationNumber: null,
        stocks: [{ quantity: 25, unitOfMeasureQuantity: 'kg', type: 'IN' }],
        warehouse: {
          name: 'Magazzino',
          company: { name: 'Azienda' },
        },
      },
    ] as never);

    const result = await tool.invoke({});

    expect(result).toContain('Prodotti in magazzino (1)');
    expect(result).toContain('Disponibile');
    expect(result).not.toContain('Esaurito');
  });

  it('returns message when all products have zero stock', async () => {
    const tool = createSearchCompanyStockTool('user-1');

    jest
      .spyOn(prisma.userOnCompany, 'findMany')
      .mockResolvedValue([{ userId: 'user-1', companyId: 'company-1', role: 'ADMIN' }] as never);

    jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Esaurito',
        category: ProductCategory.PESTICIDE,
        registrationNumber: null,
        stocks: [
          { quantity: 50, unitOfMeasureQuantity: 'kg', type: 'CARICO' },
          { quantity: 50, unitOfMeasureQuantity: 'kg', type: 'SCARICO' },
        ],
        warehouse: {
          name: 'Magazzino',
          company: { name: 'Azienda' },
        },
      },
    ] as never);

    const result = await tool.invoke({});

    expect(result).toBe('Nessun prodotto con giacenza positiva trovato.');
  });

  it('passes companyName and category filters to prisma query', async () => {
    const tool = createSearchCompanyStockTool('user-1');

    jest
      .spyOn(prisma.userOnCompany, 'findMany')
      .mockResolvedValue([{ userId: 'user-1', companyId: 'company-1', role: 'ADMIN' }] as never);

    const findManySpy = jest.spyOn(prisma.product, 'findMany').mockResolvedValue([]);

    await tool.invoke({ companyName: 'Rossi', category: 'PESTICIDE', searchTerm: 'captano' });

    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          warehouse: expect.objectContaining({
            company: { name: { contains: 'Rossi', mode: 'insensitive' } },
          }),
          category: 'PESTICIDE',
          name: { contains: 'captano', mode: 'insensitive' },
        }),
      }),
    );
  });

  it('handles prisma errors gracefully', async () => {
    const tool = createSearchCompanyStockTool('user-1');

    jest.spyOn(prisma.userOnCompany, 'findMany').mockRejectedValue(new Error('Connection refused'));

    const result = await tool.invoke({});

    expect(result).toContain('Errore nella ricerca prodotti');
    expect(result).toContain('Connection refused');
  });

  it('rounds net quantity to 2 decimal places', async () => {
    const tool = createSearchCompanyStockTool('user-1');

    jest
      .spyOn(prisma.userOnCompany, 'findMany')
      .mockResolvedValue([{ userId: 'user-1', companyId: 'company-1', role: 'ADMIN' }] as never);

    jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Prodotto',
        category: ProductCategory.PESTICIDE,
        registrationNumber: null,
        stocks: [
          { quantity: 10.333, unitOfMeasureQuantity: 'kg', type: 'CARICO' },
          { quantity: 3.111, unitOfMeasureQuantity: 'kg', type: 'SCARICO' },
        ],
        warehouse: {
          name: 'Magazzino',
          company: { name: 'Azienda' },
        },
      },
    ] as never);

    const result = await tool.invoke({});

    // 10.333 - 3.111 = 7.222
    expect(result).toContain('Giacenza: 7.22 kg');
  });

  it('omits registration number when null', async () => {
    const tool = createSearchCompanyStockTool('user-1');

    jest
      .spyOn(prisma.userOnCompany, 'findMany')
      .mockResolvedValue([{ userId: 'user-1', companyId: 'company-1', role: 'ADMIN' }] as never);

    jest.spyOn(prisma.product, 'findMany').mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Prodotto Senza Reg',
        category: ProductCategory.FERTILIZER,
        registrationNumber: null,
        stocks: [{ quantity: 10, unitOfMeasureQuantity: 'kg', type: 'IN' }],
        warehouse: {
          name: 'Magazzino',
          company: { name: 'Azienda' },
        },
      },
    ] as never);

    const result = await tool.invoke({});

    expect(result).toContain('Prodotto Senza Reg');
    expect(result).not.toContain('Reg:');
  });
});
