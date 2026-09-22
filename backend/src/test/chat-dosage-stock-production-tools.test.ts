import { ProductCategory } from '@prisma/client';
import {
  createSearchCompanyStockTool,
  createListProductionUnitsTool,
} from '../infrastructure/services/agents/chat_dosage_agent/tools-stock-production';
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

describe('createListProductionUnitsTool', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns formatted production units list', async () => {
    const tool = createListProductionUnitsTool('user-1');

    jest.spyOn(prisma.productionUnitOnField, 'findMany').mockResolvedValue([
      {
        id: 'puf-1',
        productionUnitId: 'pu-1',
        fieldId: 'field-1',
        areaHaOnField: 1.5,
        productionUnit: {
          id: 'pu-1',
          name: 'Vigna Alta',
          cycles: [
            {
              id: 'cycle-1',
              cropName: 'Vite da uva da vino',
              variety: 'Sangiovese',
              protocoll: 'Biologico',
              seasonYear: 2026,
            },
          ],
        },
        field: {
          name: 'Campo Nord',
          sauHa: 2.0,
          gisHa: 2.1,
          company: { name: 'Azienda Rossi' },
        },
      },
    ] as never);

    const result = await tool.invoke({});

    expect(result).toContain('Unità produttive (1)');
    expect(result).toContain('Vigna Alta');
    expect(result).toContain('Vite da uva da vino');
    expect(result).toContain('Sangiovese');
    expect(result).toContain('Biologico');
    expect(result).toContain('1.5 ha');
    expect(result).toContain('Campo Nord');
    expect(result).toContain('Azienda Rossi');
  });

  it('returns message when no production units found', async () => {
    const tool = createListProductionUnitsTool('user-1');

    jest.spyOn(prisma.productionUnitOnField, 'findMany').mockResolvedValue([]);

    const result = await tool.invoke({});

    expect(result).toBe('Nessuna unità produttiva trovata.');
  });

  it('deduplicates production units spanning multiple fields', async () => {
    const tool = createListProductionUnitsTool('user-1');

    jest.spyOn(prisma.productionUnitOnField, 'findMany').mockResolvedValue([
      {
        id: 'puf-1',
        productionUnitId: 'pu-1',
        fieldId: 'field-1',
        areaHaOnField: 1.0,
        productionUnit: {
          id: 'pu-1',
          name: 'UP Multi-Campo',
          cycles: [
            { id: 'c-1', cropName: 'Melo', variety: 'Golden', protocoll: '', seasonYear: 2026 },
          ],
        },
        field: {
          name: 'Campo A',
          sauHa: 1.5,
          gisHa: 1.5,
          company: { name: 'Azienda' },
        },
      },
      {
        id: 'puf-2',
        productionUnitId: 'pu-1',
        fieldId: 'field-2',
        areaHaOnField: 0.8,
        productionUnit: {
          id: 'pu-1',
          name: 'UP Multi-Campo',
          cycles: [
            { id: 'c-1', cropName: 'Melo', variety: 'Golden', protocoll: '', seasonYear: 2026 },
          ],
        },
        field: {
          name: 'Campo B',
          sauHa: 1.0,
          gisHa: 1.0,
          company: { name: 'Azienda' },
        },
      },
    ] as never);

    const result = await tool.invoke({});

    expect(result).toContain('Unità produttive (1)');
    expect(result).toContain('UP Multi-Campo');
    expect(result).toContain('1.8 ha');
    expect(result).toContain('Campo A, Campo B');
  });

  it('filters by cropName (case-insensitive)', async () => {
    const tool = createListProductionUnitsTool('user-1');

    jest.spyOn(prisma.productionUnitOnField, 'findMany').mockResolvedValue([
      {
        id: 'puf-1',
        productionUnitId: 'pu-1',
        fieldId: 'field-1',
        areaHaOnField: 2.0,
        productionUnit: {
          id: 'pu-1',
          name: 'Vigneto',
          cycles: [
            {
              id: 'c-1',
              cropName: 'Vite da uva da vino',
              variety: '',
              protocoll: '',
              seasonYear: 2026,
            },
          ],
        },
        field: { name: 'Campo 1', sauHa: 2.0, gisHa: 2.0, company: { name: 'Azienda' } },
      },
      {
        id: 'puf-2',
        productionUnitId: 'pu-2',
        fieldId: 'field-2',
        areaHaOnField: 1.0,
        productionUnit: {
          id: 'pu-2',
          name: 'Meleto',
          cycles: [
            { id: 'c-2', cropName: 'Melo', variety: 'Fuji', protocoll: '', seasonYear: 2026 },
          ],
        },
        field: { name: 'Campo 2', sauHa: 1.5, gisHa: 1.5, company: { name: 'Azienda' } },
      },
    ] as never);

    const result = await tool.invoke({ cropName: 'vite' });

    expect(result).toContain('Unità produttive (1)');
    expect(result).toContain('Vigneto');
    expect(result).toContain('Vite da uva da vino');
    expect(result).not.toContain('Meleto');
  });

  it('returns crop-specific message when cropName filter yields no results', async () => {
    const tool = createListProductionUnitsTool('user-1');

    jest.spyOn(prisma.productionUnitOnField, 'findMany').mockResolvedValue([
      {
        id: 'puf-1',
        productionUnitId: 'pu-1',
        fieldId: 'field-1',
        areaHaOnField: 1.0,
        productionUnit: {
          id: 'pu-1',
          name: 'Vigneto',
          cycles: [{ id: 'c-1', cropName: 'Vite', variety: '', protocoll: '', seasonYear: 2026 }],
        },
        field: { name: 'Campo', sauHa: 1.0, gisHa: 1.0, company: { name: 'Azienda' } },
      },
    ] as never);

    const result = await tool.invoke({ cropName: 'olivo' });

    expect(result).toBe('Nessuna unità produttiva trovata con coltura "olivo".');
  });

  it('handles production units without cycles gracefully', async () => {
    const tool = createListProductionUnitsTool('user-1');

    jest.spyOn(prisma.productionUnitOnField, 'findMany').mockResolvedValue([
      {
        id: 'puf-1',
        productionUnitId: 'pu-1',
        fieldId: 'field-1',
        areaHaOnField: 1.0,
        productionUnit: {
          id: 'pu-1',
          name: 'UP Senza Ciclo',
          cycles: [],
        },
        field: { name: 'Campo', sauHa: 1.0, gisHa: 1.0, company: { name: 'Azienda' } },
      },
    ] as never);

    const result = await tool.invoke({});

    expect(result).toContain('UP Senza Ciclo');
    expect(result).toContain('Coltura: N/A');
  });

  it('handles prisma errors gracefully', async () => {
    const tool = createListProductionUnitsTool('user-1');

    jest.spyOn(prisma.productionUnitOnField, 'findMany').mockRejectedValue(new Error('DB timeout'));

    const result = await tool.invoke({});

    expect(result).toContain('Errore nella ricerca unità produttive');
    expect(result).toContain('DB timeout');
  });

  it('passes companyName filter to prisma query', async () => {
    const tool = createListProductionUnitsTool('user-1');

    const findManySpy = jest.spyOn(prisma.productionUnitOnField, 'findMany').mockResolvedValue([]);

    await tool.invoke({ companyName: 'Rossi' });

    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          field: expect.objectContaining({
            company: expect.objectContaining({
              name: { contains: 'Rossi', mode: 'insensitive' },
            }),
          }),
        }),
      }),
    );
  });

  it('shows variety only when present', async () => {
    const tool = createListProductionUnitsTool('user-1');

    jest.spyOn(prisma.productionUnitOnField, 'findMany').mockResolvedValue([
      {
        id: 'puf-1',
        productionUnitId: 'pu-1',
        fieldId: 'field-1',
        areaHaOnField: 1.0,
        productionUnit: {
          id: 'pu-1',
          name: 'UP Senza Varietà',
          cycles: [
            {
              id: 'c-1',
              cropName: 'Grano',
              variety: '',
              protocoll: 'Convenzionale',
              seasonYear: 2026,
            },
          ],
        },
        field: { name: 'Campo', sauHa: 1.0, gisHa: 1.0, company: { name: 'Azienda' } },
      },
    ] as never);

    const result = await tool.invoke({});

    expect(result).toContain('Coltura: Grano |');
    // Should NOT contain parentheses for empty variety
    expect(result).not.toMatch(/Grano\s*\(\)/);
  });
});
