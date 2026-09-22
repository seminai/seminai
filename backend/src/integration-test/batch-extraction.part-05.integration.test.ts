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
import { type FieldsExtractionData, type InvoiceExtractionData } from '../domain/dtos/file-extraction.dto';
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

  // ─── Batch Confirm ───

  describe('Batch confirm', () => {
    it('should confirm all pending extractions in a batch and skip errors', async () => {
      const inputBatchId = uuid();
      const inputExtr1 = await createExtraction({
        batchId: inputBatchId,
        fileIndex: 0,
        category: 'invoice',
        fileName: 'batch-invoice.pdf',
      });
      const inputExtr2 = await createExtraction({
        batchId: inputBatchId,
        fileIndex: 1,
        category: 'fields',
        fileName: 'batch-fields.csv',
      });
      const inputExtr3 = await createExtraction({
        batchId: inputBatchId,
        fileIndex: 2,
        category: 'fields',
        fileName: 'batch-error.csv',
      });
      await fileExtractionRepo.update(inputExtr1.id, {
        status: 'PENDING_CONFIRMATION',
        progress: 100,
        extractedData: {
          entries: [
            {
              productName: 'Batch Product',
              registrationNumber: null,
              productCategory: 'OTHER',
              administrativeStatus: null,
              quantity: 5,
              quantityUnitOfMeasure: 'KG',
              unitPrice: 10,
              totalPrice: 50,
              invoiceNumber: 'FT-BATCH',
              invoiceDate: '2026-03-01',
              invoiceDueDate: null,
              supplierName: 'Batch Supplier',
              supplierVat: '33333333333',
            },
          ],
          extractedCount: 1,
        } satisfies InvoiceExtractionData,
      });
      await fileExtractionRepo.update(inputExtr2.id, {
        status: 'PENDING_CONFIRMATION',
        progress: 100,
        extractedData: {
          fields: [
            {
              companyId: testCompanyId,
              name: 'Batch Field 1',
              coordinates: [],
              coordinatesGaussBoaga: [],
              latitude: null,
              longitude: null,
              polygon: null,
              polygonGaussBoaga: null,
              gisHa: null,
              sauHa: null,
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
              foglio: '99',
              particella: '999',
              subalterno: null,
              nation: null,
              region: null,
              city: null,
              address: null,
              cap: null,
              variazioneMq: null,
              inizioConduzione: null,
              fineConduzione: null,
            },
          ],
          extractedCount: 1,
        } satisfies FieldsExtractionData,
      });
      await fileExtractionRepo.update(inputExtr3.id, {
        status: 'ERROR',
        error: 'Simulated extraction failure',
      });
      const actualResult = await confirmer.confirmBatch(inputBatchId);
      expect(actualResult.confirmed).toHaveLength(2);
      expect(actualResult.skipped).toBe(1);
      expect(actualResult.errors).toHaveLength(0);
      const actualExtr1 = await fileExtractionRepo.findById(inputExtr1.id);
      const actualExtr2 = await fileExtractionRepo.findById(inputExtr2.id);
      const actualExtr3 = await fileExtractionRepo.findById(inputExtr3.id);
      expect(actualExtr1!.status).toBe('CONFIRMED');
      expect(actualExtr2!.status).toBe('CONFIRMED');
      expect(actualExtr3!.status).toBe('ERROR');
    });

    it('should skip already-confirmed extractions', async () => {
      const inputBatchId = uuid();
      const inputExtr = await createExtraction({
        batchId: inputBatchId,
        fileIndex: 0,
        category: 'fields',
      });
      await fileExtractionRepo.update(inputExtr.id, {
        status: 'CONFIRMED',
        progress: 100,
      });
      const actualResult = await confirmer.confirmBatch(inputBatchId);
      expect(actualResult.confirmed).toHaveLength(0);
      expect(actualResult.skipped).toBe(1);
    });
  });

  // ─── Company association ───

  describe('Company association', () => {
    it('should create fields under the correct companyId after confirm', async () => {
      const inputExtraction = await createExtraction({ category: 'fields' });
      const inputFieldName = `CompanyCheck-${Date.now()}`;
      const inputData: FieldsExtractionData = {
        fields: [
          {
            companyId: testCompanyId,
            name: inputFieldName,
            coordinates: [],
            coordinatesGaussBoaga: [],
            latitude: null,
            longitude: null,
            polygon: null,
            polygonGaussBoaga: null,
            gisHa: null,
            sauHa: null,
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
            foglio: null,
            particella: null,
            subalterno: null,
            nation: null,
            region: null,
            city: null,
            address: null,
            cap: null,
            variazioneMq: null,
            inizioConduzione: null,
            fineConduzione: null,
          },
        ],
        extractedCount: 1,
      };
      await fileExtractionRepo.update(inputExtraction.id, {
        status: 'PENDING_CONFIRMATION',
        progress: 100,
        extractedData: inputData,
      });
      await confirmer.confirm(inputExtraction.id);
      const actualField = await prisma.field.findFirst({
        where: { name: inputFieldName },
      });
      expect(actualField).not.toBeNull();
      expect(actualField!.companyId).toBe(testCompanyId);
    });
  });});
