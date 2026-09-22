import { JobCategory, ProductCategory } from '@prisma/client';
import { createOptimizeSelectedJobsTool } from '../infrastructure/services/agents/chat_dosage_agent/tools-job-optimization';
import type { IJobRepository } from '../domain/repositories/IJobRepository';
import type { IStockRepository } from '../domain/repositories/IStockRepository';
import { Job } from '../domain/entities/Job';
import { prisma } from '../infrastructure/repositories/Prisma';

jest.mock('../infrastructure/repositories/Prisma', () => ({
  prisma: {
    job: { findMany: jest.fn() },
    labelExtraction: { findFirst: jest.fn() },
  },
}));

jest.mock('../infrastructure/services/agents/dosage_agent/bbchPhenologyMapper', () => ({
  mapEpocaToApplicationDates: jest.fn().mockResolvedValue({
    startDate: '2026-03-19',
    endDate: '2026-03-24',
    bbchStart: 67,
    bbchEnd: 69,
    reasoning: 'mock-window',
  }),
}));

function buildMockJobRepository(): IJobRepository {
  return {
    create: jest.fn().mockImplementation(async (job: Job) => job),
    createMany: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue(null),
    findAll: jest.fn().mockResolvedValue([]),
    findManyByProductionUnitId: jest.fn().mockResolvedValue([]),
    findManyByUserIdWithAssignment: jest.fn().mockResolvedValue([]),
    findManyByUserIdWithAssignmentWithoutHistory: jest.fn().mockResolvedValue([]),
    findVerifiedJobsByUserIdWithAssignment: jest.fn().mockResolvedValue({ jobs: [], total: 0 }),
    findUnverifiedJobsByUserIdWithAssignment: jest.fn().mockResolvedValue([]),
    findManyByIdsWithProducts: jest.fn().mockResolvedValue([]),
    findManyByIdsWithCompany: jest.fn().mockResolvedValue([]),
    findJobGroupsSummaryByUserId: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockRejectedValue(new Error('not-used')),
    delete: jest.fn().mockResolvedValue(undefined),
    deleteMany: jest.fn().mockResolvedValue(undefined),
  };
}

function buildMockStockRepository(): IStockRepository {
  return {
    create: jest.fn().mockRejectedValue(new Error('not-used')),
    createMany: jest.fn().mockResolvedValue(undefined),
    getAvailableQuantity: jest.fn().mockResolvedValue(0),
    deleteByJobId: jest.fn().mockResolvedValue(undefined),
    deleteBySourceFileIds: jest.fn().mockResolvedValue(0),
    deleteByCompanyId: jest.fn().mockResolvedValue(0),
    updateFileUrl: jest.fn().mockRejectedValue(new Error('not-used')),
    update: jest.fn().mockRejectedValue(new Error('not-used')),
    findDeletionContext: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(undefined),
  };
}

describe('createOptimizeSelectedJobsTool', () => {
  const originalBdfUrl = process.env.URL_SERVER_BDF;
  const originalBdfUser = process.env.USERNAME_BDF;
  const originalBdfPass = process.env.PASSWORD_BDF;

  beforeEach(() => {
    delete process.env.URL_SERVER_BDF;
    delete process.env.USERNAME_BDF;
    delete process.env.PASSWORD_BDF;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env.URL_SERVER_BDF = originalBdfUrl;
    process.env.USERNAME_BDF = originalBdfUser;
    process.env.PASSWORD_BDF = originalBdfPass;
  });

  it('creates a distributed multi-day plan with label constraints', async () => {
    const jobRepo = buildMockJobRepository();
    const stockRepo = buildMockStockRepository();
    const tool = createOptimizeSelectedJobsTool({
      userId: 'user-1',
      jobRepository: jobRepo,
      stockRepository: stockRepo,
    });
    jest.spyOn(prisma.job, 'findMany').mockResolvedValue([
      {
        id: 'job-1',
        productionUnitId: 'pu-1',
        productionCycleId: 'pc-1',
        dateOfOpeation: new Date('2026-03-20T00:00:00.000Z'),
        category: JobCategory.TREATMENT,
        quantity: 3,
        unitOfMeasureQuantity: 'L/ha',
        avversity: 'Ticchiolatura',
        modeOfApplication: 'irrorazione',
        treatedSurface: 1.3,
        isLocalizedTreatment: false,
        totalDistributedWaterL: 240,
        machineId: null,
        jobId: null,
        productionUnit: {
          id: 'pu-1',
          name: 'unit',
          startDate: new Date('2026-03-01T00:00:00.000Z'),
          endDate: new Date('2026-10-01T00:00:00.000Z'),
          cycles: [],
        },
        productionCycle: {
          id: 'pc-1',
          cropName: 'Melo',
          floweringDate: new Date('2026-03-20T00:00:00.000Z'),
          harvestingDate: new Date('2026-09-01T00:00:00.000Z'),
        },
        stocks: [
          {
            id: 'stock-1',
            productId: 'prod-1',
            quantity: 3,
            unitOfMeasureQuantity: 'L/ha',
            price: 0,
            unitOfMeasurePrice: '',
            type: 'USAGE',
            companySupplierName: null,
            product: {
              id: 'prod-1',
              name: 'Copertura X',
              sku: 'sku-1',
              barcode: null,
              category: ProductCategory.PESTICIDE,
              type: 'FITO',
              description: null,
              administrativeStatus: null,
              registrationNumber: 'REG-1',
              labelUrl: null,
              labelMetadata: null,
              warehouseId: 'w-1',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        ],
      } as never,
    ]);
    jest.spyOn(prisma.labelExtraction, 'findFirst').mockResolvedValue({
      id: 'le-1',
      productName: 'Copertura X',
      registrationNumber: 'REG-1',
      sourceUrl: 'mock',
      category: 'FITO',
      label: {
        prodotto: 'Copertura X',
        categoria: 'Fungicida',
        principio_attivo: 'AI',
        composizione: null,
        meccanismo_azione_frac: null,
        malattie: ['Ticchiolatura'],
        specie: [],
        colture_target: ['Melo'],
        dosaggi_dettagliati: [
          {
            coltura: 'Melo',
            malattia: 'Ticchiolatura',
            dose_minima: 1,
            dose_massima: 2,
            dose_um: 'L/ha',
            n_max_applicazioni: 3,
            intervallo_min_giorni: 7,
            epoca_impiego: 'fine della fioritura',
          },
        ],
        fasce_di_rispetto_e_deriva: [],
        avvertenze: [],
        frasi_pericolo: [],
        frasi_prudenza: [],
        compatibilita: null,
        fitotossicita: null,
        note_tecniche: null,
        extraction_confidence: 90,
        extracted_fields: [],
        errors: [],
      },
      rawText: '',
      extractionConfidence: 90,
      isVerified: true,
      extractedFields: [],
      errors: [],
      qualityExtraction: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    const result = await tool.invoke({
      selectedJobIds: ['job-1'],
      optimizationRequest: 'ottimizza e distribuisci su più giorni come fungicida di copertura',
      createNewJobs: true,
    });
    const parsed = JSON.parse(result as string) as {
      createdJobs: ReadonlyArray<{ date: string; quantity: number }>;
    };
    expect(parsed.createdJobs).toHaveLength(3);
    expect(parsed.createdJobs.map((item) => item.quantity)).toEqual([2, 2, 2]);
    expect(parsed.createdJobs.map((item) => item.date)).toEqual([
      '2026-03-19',
      '2026-04-01',
      '2026-04-14',
    ]);
    expect(jobRepo.create).toHaveBeenCalledTimes(3);
  });

  it('does not run optimization when request is not explicit', async () => {
    const jobRepo = buildMockJobRepository();
    const stockRepo = buildMockStockRepository();
    const tool = createOptimizeSelectedJobsTool({
      userId: 'user-1',
      jobRepository: jobRepo,
      stockRepository: stockRepo,
    });
    const result = await tool.invoke({
      selectedJobIds: ['job-1'],
      optimizationRequest: 'modifica il report',
      createNewJobs: true,
    });
    expect(result).toContain('No explicit optimization intent detected');
    expect(jobRepo.create).not.toHaveBeenCalled();
  });
});
