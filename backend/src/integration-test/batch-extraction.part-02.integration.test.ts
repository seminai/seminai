import { v4 as uuid } from 'uuid';
import { prisma, cleanupTestData } from './setup';
import { createTestUser, createTestCompany, deleteTestUser, deleteAllTestCompanies } from './helpers';
import { PrismaFileExtractionRepository } from '../infrastructure/repositories/PrismaFileExtractionRepository';
import { PrismaFieldRepository } from '../infrastructure/repositories/PrismaFieldRepository';
import { PrismaCompanyRepository } from '../infrastructure/repositories/PrismaCompanyRepository';
import { PrismaProductRepository } from '../infrastructure/repositories/PrismaProductRepository';
import { PrismaStockRepository } from '../infrastructure/repositories/PrismaStockRepository';
import { PrismaWarehouseRepository } from '../infrastructure/repositories/PrismaWarehouseRepository';
import { PrismaProductionUnitRepository } from '../infrastructure/repositories/PrismaProductionUnitRepository';
import { BulkImportFieldsAndProductionUnitsUseCase } from '../application/use-cases/bulk-import/BulkImportFieldsAndProductionUnitsUseCase';
import { CreateOrUpdateProductsAndStocksBulkUseCase } from '../application/use-cases/product/CreateOrUpdateProductsAndStocksBulkUseCase';
import { ExtractionConfirmer } from '../infrastructure/services/extraction/extraction-confirmer';
import { type AgriculturalExtractionData } from '../domain/dtos/file-extraction.dto';
import type { FileExtractionRecord, CreateFileExtractionInput } from '../domain/repositories/IFileExtractionRepository';
describe('Batch Extraction Integration Tests', () => {
  let fileExtractionRepo: PrismaFileExtractionRepository;
  let companyRepository: PrismaCompanyRepository;
  let confirmer: ExtractionConfirmer;
  let testUserId: string;
  let testCompanyId: string;
  const createdExtractionIds: string[] = [];

  beforeAll(async () => {
    fileExtractionRepo = new PrismaFileExtractionRepository();
    const fieldRepository = new PrismaFieldRepository(prisma);
    companyRepository = new PrismaCompanyRepository(prisma);
    const productRepository = new PrismaProductRepository(prisma);
    const stockRepository = new PrismaStockRepository(prisma);
    const warehouseRepository = new PrismaWarehouseRepository(prisma);
    const productionUnitRepository = new PrismaProductionUnitRepository(prisma);
    const bulkImportUseCase = new BulkImportFieldsAndProductionUnitsUseCase(
      fieldRepository,
      productionUnitRepository,
      companyRepository,
    );
    const productStockUseCase = new CreateOrUpdateProductsAndStocksBulkUseCase(
      productRepository,
      stockRepository,
      warehouseRepository,
    );
    confirmer = new ExtractionConfirmer(
      fileExtractionRepo,
      companyRepository,
      bulkImportUseCase,
      productStockUseCase,
    );
    const testUser = await createTestUser();
    testUserId = testUser.id;
    const company = await createTestCompany({ userId: testUserId });
    testCompanyId = company.id;
  });

  afterAll(async () => {
    for (const id of createdExtractionIds) {
      await prisma.fileExtraction.delete({ where: { id } }).catch(() => {});
    }
    await deleteAllTestCompanies(testUserId);
    await deleteTestUser();
    await cleanupTestData();
  });

  function trackExtraction(record: FileExtractionRecord): FileExtractionRecord {
    createdExtractionIds.push(record.id);
    return record;
  }

  async function createExtraction(
    overrides: Partial<CreateFileExtractionInput> = {},
  ): Promise<FileExtractionRecord> {
    const input: CreateFileExtractionInput = {
      batchId: overrides.batchId ?? uuid(),
      category: overrides.category ?? 'fields',
      fileName: overrides.fileName ?? 'test-file.csv',
      fileIndex: overrides.fileIndex ?? 0,
      fileId: overrides.fileId ?? null,
      companyId: overrides.companyId ?? testCompanyId,
      userId: overrides.userId ?? testUserId,
    };
    const record = await fileExtractionRepo.create(input);
    return trackExtraction(record);
  }

  // ─── ExtractionConfirmer — Agricultural (fields + production units) ───

  describe('ExtractionConfirmer — agricultural', () => {
    it('should confirm agricultural extraction and create fields + production units', async () => {
      const inputExtraction = await createExtraction({ category: 'agricultural' });
      const inputData: AgriculturalExtractionData = {
        fields: [
          {
            companyId: testCompanyId,
            name: 'Agri Field 1',
            coordinates: [12.0, 45.0],
            coordinatesGaussBoaga: [],
            latitude: 45.0,
            longitude: 12.0,
            polygon: null,
            polygonGaussBoaga: null,
            gisHa: 3.0,
            sauHa: 2.5,
            ph: null,
            nitrogen: null,
            phosphorus: null,
            potassium: null,
            calcium: null,
            magnesium: null,
            soilType: null,
            uso: null,
            qualita: null,
            superficieCatastaleMq: null,
            sezione: null,
            foglio: '20',
            particella: '300',
            subalterno: null,
            nation: 'Italia',
            region: 'Veneto',
            city: 'Padova',
            address: null,
            cap: null,
            variazioneMq: null,
            inizioConduzione: null,
            fineConduzione: null,
          },
        ],
        productionUnits: [
          {
            name: 'Agri PU 1',
            cropName: 'Grano tenero',
            cropType: 'Cereali',
            variety: 'Bologna',
            protocoll: 'Convenzionale',
            protectionStructure: 'Pieno campo',
            startDate: '2026-03-01',
            endDate: '2026-09-30',
            areaHa: 3.0,
            cycles: [
              {
                cycleIndex: 1,
                cropName: 'Grano tenero',
                cropType: 'Cereali',
                variety: 'Bologna',
                protocoll: 'Convenzionale',
                protectionStructure: 'Pieno campo',
                startDate: '2026-03-01',
                floweringDate: '2026-05-15',
                harvestingDate: '2026-07-15',
                endDate: '2026-07-31',
              },
              {
                cycleIndex: 2,
                cropName: 'Soia',
                cropType: 'Leguminose',
                variety: 'T45',
                protocoll: 'Convenzionale',
                protectionStructure: 'Pieno campo',
                startDate: '2026-08-01',
                floweringDate: '2026-09-01',
                harvestingDate: '2026-10-15',
                endDate: '2026-10-31',
              },
            ],
            fieldAllocations: [
              { foglio: '20', particella: '300', areaHa: 3.0, fieldName: 'Agri Field 1' },
            ],
          },
        ],
        extractedCount: 2,
      };
      await fileExtractionRepo.update(inputExtraction.id, {
        status: 'PENDING_CONFIRMATION',
        progress: 100,
        extractedData: inputData,
      });
      const actualResult = await confirmer.confirm(inputExtraction.id);
      expect(actualResult.status).toBe('CONFIRMED');
      expect(actualResult.summary).toMatchObject({
        fieldsCreated: 1,
        productionUnitsCreated: 1,
      });
      const actualDbExtraction = await fileExtractionRepo.findById(inputExtraction.id);
      expect(actualDbExtraction!.status).toBe('CONFIRMED');
      const actualProductionUnit = await prisma.productionUnit.findFirst({
        where: {
          name: 'Agri PU 1',
          productionUnitsOnFields: {
            some: {
              field: { companyId: testCompanyId },
            },
          },
        },
        include: {
          cycles: { orderBy: { cycleIndex: 'asc' } },
        },
      });
      expect(actualProductionUnit?.cycles.map((cycle) => cycle.cropName)).toEqual([
        'Grano tenero',
        'Soia',
      ]);
    });
  });});
