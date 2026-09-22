import { createListProductionUnitsTool } from '../infrastructure/services/agents/chat_dosage_agent/tools-stock-production';
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
