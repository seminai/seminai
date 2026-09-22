import { LIVE_TEST_CHAT_MODEL } from './live-llm-test-config';
import {
  prisma,
  createTestUser,
  deleteTestUser,
  createTestCompany,
  deleteTestCompany,
} from './helpers';
import {
  createFieldNoteAgentApp,
  handleUserMessage,
  approveAndExecute,
} from '../infrastructure/services/agents/field_note_agent';
import { saveStockInPurchase } from '../infrastructure/services/tool/saveStockInPurchase';
import { saveStockInHarvest } from '../infrastructure/services/tool/saveStockInHarvest';
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
  });

  // ============================================================
  // 2. AGENT E2E TESTS (full agent flow with text messages)
  // ============================================================

  describe('Agent E2E - Stock In Purchase (text)', () => {
    it('should handle purchase stock-in from plain text', async () => {
      console.log('\n🧪 Test: Agent E2E - acquisto da testo');

      const threadId = `thread-${randomUUID()}`;
      const app = createFieldNoteAgentApp({
        userId: testUserId,
        prisma,
        modelName: LIVE_TEST_CHAT_MODEL,
        temperature: 0.1,
      });

      let response = await handleUserMessage(
        app,
        threadId,
        'ho acquistato 50 kg di Mancozeb 80 WP per 8 euro al kg, DDT codice DDT-456 del 10 febbraio 2026, fornitore Agrimarket srl. Carica a magazzino.',
      );

      console.log(`📥 Response: ${response.status} - ${response.message?.substring(0, 200)}`);

      // Approve all analysis tool calls until we reach save
      let iterations = 0;
      while (response.status === 'REQUIRES_APPROVAL' && iterations < 15) {
        const pendingTool = response.pendingToolCalls?.[0]?.name;
        console.log(`  🔧 Pending tool: ${pendingTool}`);

        if (pendingTool?.startsWith('save_stock_')) {
          // This is the save tool - check the summary before approving
          console.log('  📋 Agent summary:', response.message?.substring(0, 400));
          response = await approveAndExecute(app, threadId);
        } else {
          response = await approveAndExecute(app, threadId);
        }
        iterations++;
      }

      // If agent asks for confirmation, send it
      if (response.status === 'COMPLETED' && response.message) {
        console.log('💬 Agent says:', response.message.substring(0, 300));

        // Send confirmation
        response = await handleUserMessage(app, threadId, 'sì, conferma');
        while (response.status === 'REQUIRES_APPROVAL' && iterations < 20) {
          console.log(`  🔧 Pending: ${response.pendingToolCalls?.[0]?.name}`);
          response = await approveAndExecute(app, threadId);
          iterations++;
        }
      }

      console.log(`📥 Final: ${response.status} - ${response.message?.substring(0, 200)}`);

      // Verify stock was created
      const stocks = await prisma.stock.findMany({
        where: {
          product: { warehouseId: testWarehouseId },
          type: 'IN',
          NOT: { quantity: 500 },
        },
        include: { product: true },
      });

      console.log(`📊 New stocks found: ${stocks.length}`);
      for (const s of stocks) {
        console.log(`  - ${s.product.name}: ${s.quantity} ${s.unitOfMeasureQuantity} (${s.type})`);
      }

      // Verify field notes
      const fieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
      });
      console.log(`📊 Field notes found: ${fieldNotes.length}`);
      for (const fn of fieldNotes) {
        console.log(`  - status: ${fn.status}, category: ${fn.category}`);
      }
    });
  });

  describe('Agent E2E - Stock In Harvest', () => {
    it('should handle harvest stock-in from text', async () => {
      console.log('\n🧪 Test: Agent E2E - raccolta');

      const threadId = `thread-${randomUUID()}`;
      const app = createFieldNoteAgentApp({
        userId: testUserId,
        prisma,
        modelName: LIVE_TEST_CHAT_MODEL,
        temperature: 0.1,
      });

      let response = await handleUserMessage(
        app,
        threadId,
        'ho raccolto 10 tonnellate di frumento tenero dal campo frumento',
      );

      console.log(`📥 Response: ${response.status} - ${response.message?.substring(0, 200)}`);

      let iterations = 0;
      while (response.status === 'REQUIRES_APPROVAL' && iterations < 15) {
        const pendingTool = response.pendingToolCalls?.[0]?.name;
        console.log(`  🔧 Pending tool: ${pendingTool}`);
        response = await approveAndExecute(app, threadId);
        iterations++;
      }

      if (response.status === 'COMPLETED' && response.message) {
        console.log('💬 Agent says:', response.message.substring(0, 300));
        response = await handleUserMessage(app, threadId, 'sì, conferma');
        while (response.status === 'REQUIRES_APPROVAL' && iterations < 20) {
          console.log(`  🔧 Pending: ${response.pendingToolCalls?.[0]?.name}`);
          response = await approveAndExecute(app, threadId);
          iterations++;
        }
      }

      console.log(`📥 Final: ${response.status} - ${response.message?.substring(0, 200)}`);

      const fieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
      });
      console.log(`📊 Field notes: ${fieldNotes.length}`);
      for (const fn of fieldNotes) {
        console.log(`  - status: ${fn.status}, category: ${fn.category}`);
      }
    });
  });

  describe('Agent E2E - Stock Out Sale', () => {
    it('should handle sale stock-out from text', async () => {
      console.log('\n🧪 Test: Agent E2E - vendita');

      const threadId = `thread-${randomUUID()}`;
      const app = createFieldNoteAgentApp({
        userId: testUserId,
        prisma,
        modelName: LIVE_TEST_CHAT_MODEL,
        temperature: 0.1,
      });

      let response = await handleUserMessage(
        app,
        threadId,
        'ho venduto 30 quintali di frumento tenero a consorzio di ravenna per 10 euro a quintale',
      );

      console.log(`📥 Response: ${response.status} - ${response.message?.substring(0, 200)}`);

      let iterations = 0;
      while (response.status === 'REQUIRES_APPROVAL' && iterations < 15) {
        const pendingTool = response.pendingToolCalls?.[0]?.name;
        console.log(`  🔧 Pending tool: ${pendingTool}`);
        response = await approveAndExecute(app, threadId);
        iterations++;
      }

      if (response.status === 'COMPLETED' && response.message) {
        console.log('💬 Agent says:', response.message.substring(0, 300));
        response = await handleUserMessage(app, threadId, 'sì, conferma');
        while (response.status === 'REQUIRES_APPROVAL' && iterations < 20) {
          console.log(`  🔧 Pending: ${response.pendingToolCalls?.[0]?.name}`);
          response = await approveAndExecute(app, threadId);
          iterations++;
        }
      }

      console.log(`📥 Final: ${response.status} - ${response.message?.substring(0, 200)}`);

      // Check stock OUT was created
      const stockOuts = await prisma.stock.findMany({
        where: {
          productId: testProductId,
          type: 'OUT',
        },
      });
      console.log(`📊 Stock OUT entries: ${stockOuts.length}`);
      for (const s of stockOuts) {
        console.log(`  - quantity: ${s.quantity} ${s.unitOfMeasureQuantity}`);
      }

      const fieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
      });
      console.log(`📊 Field notes: ${fieldNotes.length}`);
      for (const fn of fieldNotes) {
        console.log(`  - status: ${fn.status}, category: ${fn.category}`);
      }
    });
  });
});
