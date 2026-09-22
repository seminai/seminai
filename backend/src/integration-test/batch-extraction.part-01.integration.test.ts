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
import { type FieldsExtractionData } from '../domain/dtos/file-extraction.dto';
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

  // ─── Repository CRUD ───

  describe('FileExtractionRepository', () => {
    it('should create and find by id', async () => {
      const inputExtraction = await createExtraction({ fileName: 'crud-test.csv' });
      const actualFound = await fileExtractionRepo.findById(inputExtraction.id);
      expect(actualFound).not.toBeNull();
      expect(actualFound!.fileName).toBe('crud-test.csv');
      expect(actualFound!.status).toBe('LOADING');
      expect(actualFound!.companyId).toBe(testCompanyId);
      expect(actualFound!.userId).toBe(testUserId);
    });

    it('should find by batchId', async () => {
      const inputBatchId = uuid();
      await createExtraction({ batchId: inputBatchId, fileIndex: 0, fileName: 'batch-a.csv' });
      await createExtraction({ batchId: inputBatchId, fileIndex: 1, fileName: 'batch-b.csv' });
      const actualBatch = await fileExtractionRepo.findByBatchId(inputBatchId);
      expect(actualBatch).toHaveLength(2);
      expect(actualBatch[0].fileIndex).toBe(0);
      expect(actualBatch[1].fileIndex).toBe(1);
    });

    it('should find by companyId', async () => {
      const actualList = await fileExtractionRepo.findByCompanyId(testCompanyId);
      expect(actualList.length).toBeGreaterThan(0);
      expect(actualList.every((e) => e.companyId === testCompanyId)).toBe(true);
    });

    it('should update status and progress', async () => {
      const inputExtraction = await createExtraction();
      const actualUpdated = await fileExtractionRepo.update(inputExtraction.id, {
        status: 'PENDING_CONFIRMATION',
        progress: 100,
      });
      expect(actualUpdated.status).toBe('PENDING_CONFIRMATION');
      expect(actualUpdated.progress).toBe(100);
    });

    it('should update extractedData', async () => {
      const inputExtraction = await createExtraction({ category: 'fields' });
      const inputData: FieldsExtractionData = {
        fields: [],
        extractedCount: 0,
      };
      const actualUpdated = await fileExtractionRepo.update(inputExtraction.id, {
        extractedData: inputData,
      });
      expect(actualUpdated.extractedData).toEqual(inputData);
    });

    it('should delete by id', async () => {
      const inputExtraction = await createExtraction();
      const idToDelete = inputExtraction.id;
      await fileExtractionRepo.deleteById(idToDelete);
      const actualFound = await fileExtractionRepo.findById(idToDelete);
      expect(actualFound).toBeNull();
      const idx = createdExtractionIds.indexOf(idToDelete);
      if (idx >= 0) createdExtractionIds.splice(idx, 1);
    });
  });

  // ─── ExtractionConfirmer — Fields ───

  describe('ExtractionConfirmer — fields', () => {
    it('should confirm fields extraction and create Field entities under the correct company', async () => {
      const inputExtraction = await createExtraction({ category: 'fields' });
      const inputFieldsData: FieldsExtractionData = {
        fields: [
          {
            companyId: testCompanyId,
            name: 'Test Field A',
            coordinates: [11.5, 44.5],
            coordinatesGaussBoaga: [],
            latitude: 44.5,
            longitude: 11.5,
            polygon: null,
            polygonGaussBoaga: null,
            gisHa: 1.5,
            sauHa: 1.2,
            ph: null,
            nitrogen: null,
            phosphorus: null,
            potassium: null,
            calcium: null,
            magnesium: null,
            soilType: null,
            uso: 'SEMINATIVO',
            qualita: null,
            superficieCatastaleMq: 15000,
            sezione: null,
            foglio: '10',
            particella: '100',
            subalterno: null,
            nation: 'Italia',
            region: 'Emilia-Romagna',
            city: 'Bologna',
            address: null,
            cap: '40100',
            variazioneMq: null,
            inizioConduzione: null,
            fineConduzione: null,
          },
          {
            companyId: testCompanyId,
            name: 'Test Field B',
            coordinates: [11.6, 44.6],
            coordinatesGaussBoaga: [],
            latitude: 44.6,
            longitude: 11.6,
            polygon: null,
            polygonGaussBoaga: null,
            gisHa: 2.0,
            sauHa: 1.8,
            ph: null,
            nitrogen: null,
            phosphorus: null,
            potassium: null,
            calcium: null,
            magnesium: null,
            soilType: null,
            uso: 'SEMINATIVO',
            qualita: null,
            superficieCatastaleMq: 20000,
            sezione: null,
            foglio: '11',
            particella: '200',
            subalterno: null,
            nation: 'Italia',
            region: 'Emilia-Romagna',
            city: 'Bologna',
            address: null,
            cap: '40100',
            variazioneMq: null,
            inizioConduzione: null,
            fineConduzione: null,
          },
        ],
        extractedCount: 2,
      };
      await fileExtractionRepo.update(inputExtraction.id, {
        status: 'PENDING_CONFIRMATION',
        progress: 100,
        extractedData: inputFieldsData,
      });
      const actualResult = await confirmer.confirm(inputExtraction.id);
      expect(actualResult.status).toBe('CONFIRMED');
      expect(actualResult.category).toBe('fields');
      expect(actualResult.summary).toMatchObject({ fieldsCreated: 2 });
      const actualFields = await prisma.field.findMany({
        where: { companyId: testCompanyId, name: { startsWith: 'Test Field' } },
      });
      expect(actualFields).toHaveLength(2);
      expect(actualFields.every((f) => f.companyId === testCompanyId)).toBe(true);
    });

    it('should reject confirm when status is not PENDING_CONFIRMATION', async () => {
      const inputExtraction = await createExtraction({ category: 'fields' });
      await expect(confirmer.confirm(inputExtraction.id)).rejects.toThrow(
        'Cannot confirm extraction with status LOADING',
      );
    });

    it('should reject confirm when extractedData is null', async () => {
      const inputExtraction = await createExtraction({ category: 'fields' });
      await fileExtractionRepo.update(inputExtraction.id, {
        status: 'PENDING_CONFIRMATION',
        progress: 100,
      });
      await expect(confirmer.confirm(inputExtraction.id)).rejects.toThrow(
        'No extracted data to confirm',
      );
    });
  });});
