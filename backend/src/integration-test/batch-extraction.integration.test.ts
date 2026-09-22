import { v4 as uuid } from 'uuid';
import { prisma, cleanupTestData } from './setup';
import {
  createTestUser,
  createTestCompany,
  deleteTestUser,
  deleteAllTestCompanies,
} from './helpers';
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
import {
  type FieldsExtractionData,
  type AgriculturalExtractionData,
  type InvoiceExtractionData,
  type DdtExtractionData,
  type StockExtractionData,
} from '../domain/dtos/file-extraction.dto';
import type {
  FileExtractionRecord,
  CreateFileExtractionInput,
} from '../domain/repositories/IFileExtractionRepository';

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
  });

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
  });

  // ─── ExtractionConfirmer — Invoice ───

  describe('ExtractionConfirmer — invoice', () => {
    it('should confirm invoice extraction and create products + stocks', async () => {
      const inputExtraction = await createExtraction({ category: 'invoice' });
      const inputData: InvoiceExtractionData = {
        entries: [
          {
            productName: 'Glifosate 360',
            registrationNumber: 'REG-001',
            productCategory: 'PHYTOSANITARY',
            administrativeStatus: null,
            quantity: 10,
            quantityUnitOfMeasure: 'L',
            unitPrice: 14.0,
            totalPrice: 150.0,
            needsReview: true,
            reviewReasons: ['Price mismatch: 10 * 14 != 150'],
            invoiceNumber: 'FT-2026-001',
            invoiceDate: '2026-03-01',
            invoiceDueDate: null,
            supplierName: 'AgroSupplier SRL',
            supplierVat: '98765432109',
          },
          {
            productName: 'Concime NPK 20-10-10',
            registrationNumber: null,
            productCategory: 'FERTILIZER',
            administrativeStatus: null,
            quantity: 500,
            quantityUnitOfMeasure: 'KG',
            unitPrice: 0.8,
            totalPrice: 400.0,
            invoiceNumber: 'FT-2026-001',
            invoiceDate: '2026-03-01',
            invoiceDueDate: null,
            supplierName: 'AgroSupplier SRL',
            supplierVat: '98765432109',
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
      expect(actualResult.category).toBe('invoice');
      expect((actualResult.summary as { productsCreated: number }).productsCreated).toBe(2);
      expect((actualResult.summary as { stocksCreated: number }).stocksCreated).toBe(2);
      const actualExtraction = await fileExtractionRepo.findById(inputExtraction.id);
      const actualData = actualExtraction?.extractedData as InvoiceExtractionData;
      expect(actualData.entries[0].unitPrice).toBe(15);
      expect(actualData.entries[0].needsReview).toBe(false);
      expect(actualData.entries[0].reviewReasons).toEqual([]);
    });

    it('should confirm DDT extraction (same pipeline as invoice)', async () => {
      const inputExtraction = await createExtraction({ category: 'ddt' });
      const inputData: InvoiceExtractionData = {
        entries: [
          {
            productName: 'DDT Product Test',
            registrationNumber: null,
            productCategory: 'OTHER',
            administrativeStatus: null,
            quantity: 25,
            quantityUnitOfMeasure: 'KG',
            unitPrice: 5.0,
            totalPrice: 125.0,
            invoiceNumber: 'DDT-2026-TEST',
            invoiceDate: '2026-03-10',
            invoiceDueDate: null,
            supplierName: 'DDT Supplier',
            supplierVat: '11122233344',
          },
        ],
        extractedCount: 1,
      };
      await fileExtractionRepo.update(inputExtraction.id, {
        status: 'PENDING_CONFIRMATION',
        progress: 100,
        extractedData: inputData,
      });
      const actualResult = await confirmer.confirm(inputExtraction.id);
      expect(actualResult.status).toBe('CONFIRMED');
      expect(actualResult.category).toBe('ddt');
      expect((actualResult.summary as { productsCreated: number }).productsCreated).toBe(1);
      expect((actualResult.summary as { stocksCreated: number }).stocksCreated).toBe(1);
    });

    it('should confirm DDT extraction with invoiceEntries body and persist ddt stock fields', async () => {
      const inputExtraction = await createExtraction({ category: 'ddt' });
      const inputData: DdtExtractionData = {
        entries: [
          {
            productName: 'Steel panel',
            registrationNumber: null,
            productCategory: 'OTHER',
            quantity: 25,
            quantityUnitOfMeasure: 'PZ',
            unitPrice: 18.5,
            totalPrice: 462.5,
            supplierName: 'EXAMPLE MANUFACTURING S.R.L.',
            supplierVat: '03471920367',
            ddtDate: '2026-05-28',
            orderNumber: '37/2026',
          },
        ],
        extractedCount: 1,
      };
      await fileExtractionRepo.update(inputExtraction.id, {
        status: 'PENDING_CONFIRMATION',
        progress: 100,
        extractedData: inputData,
      });
      const actualResult = await confirmer.confirm(inputExtraction.id, {
        invoiceEntries: inputData.entries.map((entry) => ({ ...entry, accepted: true })),
      });
      expect(actualResult.status).toBe('CONFIRMED');
      const actualStock = await prisma.stock.findFirst({
        where: { sourceExtractionId: inputExtraction.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(actualStock?.ddtCode).toBe('37/2026');
      expect(actualStock?.ddtDate?.toISOString().slice(0, 10)).toBe('2026-05-28');
    });
  });

  // ─── ExtractionConfirmer — Stock ───

  describe('ExtractionConfirmer — stock', () => {
    it('should confirm stock extraction with empty entries (stub)', async () => {
      const inputExtraction = await createExtraction({ category: 'stock' });
      const inputData: StockExtractionData = {
        entries: [],
        extractedCount: 0,
      };
      await fileExtractionRepo.update(inputExtraction.id, {
        status: 'PENDING_CONFIRMATION',
        progress: 100,
        extractedData: inputData,
      });
      const actualResult = await confirmer.confirm(inputExtraction.id);
      expect(actualResult.status).toBe('CONFIRMED');
      expect(actualResult.category).toBe('stock');
      expect((actualResult.summary as { productsCreated: number }).productsCreated).toBe(0);
    });
  });

  // ─── PATCH extractedData ───

  describe('PATCH extractedData', () => {
    it('should allow editing extractedData when PENDING_CONFIRMATION', async () => {
      const inputExtraction = await createExtraction({ category: 'invoice' });
      const inputOriginalData: InvoiceExtractionData = {
        entries: [
          {
            productName: 'Original Product',
            registrationNumber: null,
            productCategory: 'OTHER',
            administrativeStatus: null,
            quantity: 10,
            quantityUnitOfMeasure: 'KG',
            unitPrice: 5,
            totalPrice: 50,
            invoiceNumber: 'FT-EDIT',
            invoiceDate: '2026-03-01',
            invoiceDueDate: null,
            supplierName: 'Supplier',
            supplierVat: '11111111111',
          },
          {
            productName: 'To Remove',
            registrationNumber: null,
            productCategory: 'OTHER',
            administrativeStatus: null,
            quantity: 1,
            quantityUnitOfMeasure: 'KG',
            unitPrice: 1,
            totalPrice: 1,
            invoiceNumber: 'FT-EDIT',
            invoiceDate: '2026-03-01',
            invoiceDueDate: null,
            supplierName: 'Supplier',
            supplierVat: '11111111111',
          },
        ],
        extractedCount: 2,
      };
      await fileExtractionRepo.update(inputExtraction.id, {
        status: 'PENDING_CONFIRMATION',
        progress: 100,
        extractedData: inputOriginalData,
      });
      const inputEditedData: InvoiceExtractionData = {
        entries: [
          {
            productName: 'Edited Product',
            registrationNumber: null,
            productCategory: 'OTHER',
            administrativeStatus: null,
            quantity: 20,
            quantityUnitOfMeasure: 'L',
            unitPrice: 10,
            totalPrice: 200,
            invoiceNumber: 'FT-EDIT-MODIFIED',
            invoiceDate: '2026-03-15',
            invoiceDueDate: null,
            supplierName: 'New Supplier',
            supplierVat: '22222222222',
          },
        ],
        extractedCount: 1,
      };
      const actualUpdated = await fileExtractionRepo.update(inputExtraction.id, {
        extractedData: inputEditedData,
      });
      const actualEntries = (actualUpdated.extractedData as InvoiceExtractionData).entries;
      expect(actualEntries).toHaveLength(1);
      expect(actualEntries[0].productName).toBe('Edited Product');
      expect(actualEntries[0].quantity).toBe(20);
      const actualConfirm = await confirmer.confirm(inputExtraction.id);
      expect(actualConfirm.status).toBe('CONFIRMED');
      expect((actualConfirm.summary as { productsCreated: number }).productsCreated).toBe(1);
    });
  });

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
  });
});
