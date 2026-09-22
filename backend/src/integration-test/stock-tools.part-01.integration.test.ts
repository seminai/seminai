import { prisma, createTestUser, deleteTestUser, createTestCompany, deleteTestCompany } from './helpers';
import { saveStockInPurchase } from '../infrastructure/services/tool/saveStockInPurchase';
import { saveStockInHarvest } from '../infrastructure/services/tool/saveStockInHarvest';
import { randomUUID } from 'crypto';

/**
 * Test di integrazione per i nuovi tool di gestione magazzino:
 * - save_stock_in_purchase (carico da acquisto)
 * - save_stock_in_harvest (carico da raccolta)
 * - save_stock_out_sale (scarico per vendita)
 *
 * Per eseguire:
 * npm run test:integration -- stock-tools.integration.test.ts
 */

jest.setTimeout(300000);
describe('Stock Tools - Integration Tests', () => {
  let testUserId: string;
  let testCompanyId: string;
  let testWarehouseId: string;
  let testFieldId: string;
  let testProductionUnitId: string;
  let testProductId: string;

  beforeAll(async () => {
    console.log('🚀 Setup test environment...');

    const testUser = await createTestUser();
    testUserId = testUser.id;

    const testCompany = await createTestCompany({
      userId: testUserId,
      name: 'Azienda Test Stock',
    });
    testCompanyId = testCompany.id;

    testWarehouseId = randomUUID();
    await prisma.warehouse.create({
      data: {
        id: testWarehouseId,
        companyId: testCompanyId,
        name: 'Magazzino Test Stock',
        address: 'Via Stock 1',
        sezione: 'A',
        foglio: '1',
        particella: '100',
      },
    });

    testFieldId = randomUUID();
    await prisma.field.create({
      data: {
        id: testFieldId,
        companyId: testCompanyId,
        name: 'campo frumento',
        address: 'Via Grano 10',
        city: 'Ravenna',
        region: 'Emilia-Romagna',
        nation: 'Italia',
        cap: '48100',
        sauHa: 15.0,
        superficieCatastaleMq: 150000,
        sezione: 'A',
        foglio: '10',
        particella: '250',
      },
    });

    testProductionUnitId = randomUUID();
    await prisma.productionUnit.create({
      data: {
        id: testProductionUnitId,
        name: 'Frumento Tenero 2025',
        areaHa: 15.0,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
      },
    });
    await prisma.productionUnitOnField.create({
      data: {
        productionUnitId: testProductionUnitId,
        fieldId: testFieldId,
        areaHaOnField: 15.0,
      },
    });

    // Create a product with stock for sale tests
    testProductId = randomUUID();
    await prisma.product.create({
      data: {
        id: testProductId,
        warehouseId: testWarehouseId,
        name: 'Frumento Tenero',
        category: 'HARVEST',
        type: 'Raccolto',
        sku: `HARVEST-${Date.now()}`,
      },
    });
    await prisma.stock.create({
      data: {
        productId: testProductId,
        type: 'IN',
        quantity: 500,
        unitOfMeasureQuantity: 'q',
        price: 0,
        unitOfMeasurePrice: '',
      },
    });

    console.log('✅ Test environment ready!');
  });

  afterEach(async () => {
    // Clean up field notes created during each test
    await prisma.fieldNote.deleteMany({ where: { userId: testUserId } });
    // Clean up any stock entries except the initial one
    await prisma.stock.deleteMany({
      where: {
        product: { warehouseId: testWarehouseId },
        NOT: { quantity: 500 },
      },
    });
    // Clean up any auto-created products (keep only testProductId)
    await prisma.product.deleteMany({
      where: {
        warehouseId: testWarehouseId,
        NOT: { id: testProductId },
      },
    });
  });

  afterAll(async () => {
    console.log('🧹 Cleaning up...');
    await prisma.fieldNote.deleteMany({ where: { userId: testUserId } });
    await prisma.stock.deleteMany({ where: { productId: testProductId } });
    await prisma.product.deleteMany({ where: { warehouseId: testWarehouseId } });
    await prisma.productionUnitOnField.deleteMany({
      where: { productionUnitId: testProductionUnitId },
    });
    await prisma.productionUnit.deleteMany({ where: { id: testProductionUnitId } });
    await prisma.field.deleteMany({ where: { id: testFieldId } });
    await prisma.warehouse.deleteMany({ where: { id: testWarehouseId } });
    await deleteTestCompany(testCompanyId);
    await deleteTestUser();
    console.log('✅ Cleanup completed');
  });

  // ============================================================
  // 1. DIRECT SERVICE FUNCTION TESTS (no agent, direct DB calls)
  // ============================================================

  describe('saveStockInPurchase - Direct Service', () => {
    it('should create product and stock IN from text description', async () => {
      console.log('\n🧪 Test: Stock IN acquisto da testo');

      const result = await saveStockInPurchase(testUserId, prisma, {
        companyId: testCompanyId,
        productName: 'Rame Caffaro',
        productCategory: 'PESTICIDE',
        quantity: 30,
        unitOfMeasureQuantity: 'kg',
        price: 12.5,
        unitOfMeasurePrice: 'EUR/kg',
        documentType: 'DDT',
        documentCode: 'DDT-2026-001',
        documentDate: '2026-02-12',
        supplierName: 'Consorzio Agrario Ravenna',
        rawContent:
          'ho comprato 30 kg di Rame Caffaro, DDT DDT-2026-001 del 12/02/2026, fornitore Consorzio Agrario Ravenna',
      });

      console.log('📦 Result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.isNewProduct).toBe(true);
      expect(result.productName).toBe('Rame Caffaro');
      expect(result.stockId).toBeTruthy();
      expect(result.fieldNoteId).toBeTruthy();

      // Verify stock was created
      const stock = await prisma.stock.findFirst({ where: { id: result.stockId } });
      expect(stock).toBeTruthy();
      expect(stock!.quantity).toBe(30);
      expect(stock!.type).toBe('IN');
      expect(stock!.ddtCode).toBe('DDT-2026-001');
      expect(stock!.companySupplierName).toBe('Consorzio Agrario Ravenna');

      // Verify field note was created with PROCESSED
      const fieldNote = await prisma.fieldNote.findUnique({ where: { id: result.fieldNoteId } });
      expect(fieldNote).toBeTruthy();
      expect(fieldNote!.status).toBe('PROCESSED');
      expect(fieldNote!.productId).toBe(result.productId);

      console.log('✅ Stock IN purchase from text - PASSED');
    });

    it('should use existing product when existingProductId is provided', async () => {
      console.log('\n🧪 Test: Stock IN con prodotto esistente');

      const result = await saveStockInPurchase(testUserId, prisma, {
        companyId: testCompanyId,
        existingProductId: testProductId,
        productName: 'Frumento Tenero',
        quantity: 100,
        unitOfMeasureQuantity: 'q',
        rawContent: 'caricato 100 quintali di frumento tenero a magazzino',
      });

      expect(result.success).toBe(true);
      expect(result.isNewProduct).toBe(false);
      expect(result.productId).toBe(testProductId);

      console.log('✅ Stock IN with existing product - PASSED');
    });
  });

  describe('saveStockInHarvest - Direct Service', () => {
    it('should create harvest product and stock IN', async () => {
      console.log('\n🧪 Test: Stock IN raccolta');

      const result = await saveStockInHarvest(testUserId, prisma, {
        companyId: testCompanyId,
        fieldId: testFieldId,
        productionUnitId: testProductionUnitId,
        cropName: 'Mais',
        quantity: 10,
        unitOfMeasureQuantity: 't',
        rawContent: 'ho raccolto 10 tonnellate di mais dal campo frumento',
        operationDate: '2026-02-10',
      });

      console.log('🌾 Result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.isNewProduct).toBe(true);
      expect(result.cropName).toBe('Mais');

      // Verify stock
      const stock = await prisma.stock.findFirst({ where: { id: result.stockId } });
      expect(stock!.quantity).toBe(10);
      expect(stock!.type).toBe('IN');

      // Verify field note
      const fieldNote = await prisma.fieldNote.findUnique({ where: { id: result.fieldNoteId } });
      expect(fieldNote!.status).toBe('PROCESSED');
      expect(fieldNote!.category).toBe('HARVEST');
      expect(fieldNote!.fieldId).toBe(testFieldId);
      expect(fieldNote!.productionUnitId).toBe(testProductionUnitId);

      console.log('✅ Stock IN harvest - PASSED');
    });
  });});
