import { prisma, createTestUser, deleteTestUser, createTestCompany, deleteTestCompany } from './helpers';
import { saveStockOutSale } from '../infrastructure/services/tool/saveStockOutSale';
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

  describe('saveStockOutSale - Direct Service', () => {
    it('should create stock OUT for sale with sufficient stock', async () => {
      console.log('\n🧪 Test: Stock OUT vendita con disponibilità sufficiente');

      const result = await saveStockOutSale(testUserId, prisma, {
        companyId: testCompanyId,
        productId: testProductId,
        quantity: 30,
        unitOfMeasureQuantity: 'q',
        pricePerUnit: 10,
        unitOfMeasurePrice: 'EUR/q',
        buyerName: 'Consorzio di Ravenna',
        rawContent:
          'ho venduto 30 quintali di frumento a consorzio di ravenna per 10 euro a quintale',
      });

      console.log('💸 Result:', JSON.stringify(result, null, 2));

      expect(result.success).toBe(true);
      expect(result.insufficientStock).toBe(false);
      expect(result.availableStockBefore).toBe(500);

      // Verify stock is negative
      const stock = await prisma.stock.findFirst({ where: { id: result.stockId } });
      expect(stock!.quantity).toBe(-30);
      expect(stock!.type).toBe('OUT');
      expect(stock!.companySupplierName).toBe('Consorzio di Ravenna');

      // Verify field note
      const fieldNote = await prisma.fieldNote.findUnique({ where: { id: result.fieldNoteId } });
      expect(fieldNote!.status).toBe('PROCESSED');

      console.log('✅ Stock OUT sale - PASSED');
    });

    it('should warn when stock is insufficient', async () => {
      console.log('\n🧪 Test: Stock OUT con disponibilità insufficiente');

      const result = await saveStockOutSale(testUserId, prisma, {
        companyId: testCompanyId,
        productId: testProductId,
        quantity: 9999,
        unitOfMeasureQuantity: 'q',
        rawContent: 'ho venduto 9999 quintali di frumento',
      });

      expect(result.success).toBe(true);
      expect(result.insufficientStock).toBe(true);
      expect(result.message).toContain('ATTENZIONE');

      console.log('✅ Stock OUT insufficient warning - PASSED');
    });

    it('should reject non-existent product', async () => {
      console.log('\n🧪 Test: Stock OUT prodotto inesistente');

      await expect(
        saveStockOutSale(testUserId, prisma, {
          companyId: testCompanyId,
          productId: 'non-existent-id',
          quantity: 10,
          unitOfMeasureQuantity: 'q',
          rawContent: 'vendita prodotto inesistente',
        }),
      ).rejects.toThrow('non trovato');

      console.log('✅ Stock OUT non-existent product - PASSED');
    });
  });});
