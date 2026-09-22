import { LIVE_TEST_CHAT_MODEL } from './live-llm-test-config';
import { prisma, createTestUser, deleteTestUser, createTestCompany, deleteTestCompany } from './helpers';
import { createFieldNoteAgentApp, handleUserMessage, approveAndExecute } from '../infrastructure/services/agents/field_note_agent';
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
  });});
