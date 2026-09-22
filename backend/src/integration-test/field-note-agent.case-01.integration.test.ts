import { LIVE_TEST_CHAT_MODEL } from './live-llm-test-config';
import { prisma, createTestUser, deleteTestUser, createTestCompany, deleteTestCompany } from './helpers';
import { createFieldNoteAgentApp, handleUserMessage, approveAndExecute } from '../infrastructure/services/agents/field_note_agent';
import { randomUUID } from 'crypto';
import { FieldNoteCategory } from '@prisma/client';
/**
 * Test di integrazione E2E per il Field Note Agent.
 *
 * ATTENZIONE: Questi test effettuano chiamate reali all'API OpenAI (GPT-4o).
 * Tempi di attesa previsti: 3-4 minuti per test completo.
 *
 * Per eseguire:
 * - Assicurati di avere OPENAI_API_KEY configurata
 * - npm run test:integration -- field-note-agent.integration.test.ts
 */
jest.setTimeout(240000);
describe('Field Note Agent - Test di Integrazione E2E con LLM Reale', () => {
  let testUserId: string;
  let testCompanyId: string;
  let testFieldId: string;
  let testProductId: string;
  let testWarehouseId: string;
  let testProductionUnitId: string;
  let testField2Id: string; // campo vite sud per test ambiguità
  let testFieldGranoId: string; // campo grano per test semina/aratura
  beforeAll(async () => {
    console.log('🚀 Setup test environment...');
    const testUser = await createTestUser();
    testUserId = testUser.id;
    console.log(`✅ Test user created: ${testUserId}`);
    const testCompany = await createTestCompany({
      userId: testUserId,
      name: 'Azienda Agricola Test',
    });
    testCompanyId = testCompany.id;
    console.log(`✅ Test company created: ${testCompanyId}`);
    testWarehouseId = randomUUID();
    await prisma.warehouse.create({
      data: {
        id: testWarehouseId,
        companyId: testCompanyId,
        name: 'Magazzino Test',
        address: 'Via Test 1',
        city: 'Test City',
        cap: '00100',
        sezione: 'A',
        foglio: '1',
        particella: '100',
      },
    });
    console.log(`✅ Test warehouse created: ${testWarehouseId}`);
    testFieldId = randomUUID();
    await prisma.field.create({
      data: {
        id: testFieldId,
        companyId: testCompanyId,
        name: 'campo vite',
        address: 'Via Vigneto 10',
        city: 'Verona',
        region: 'Veneto',
        nation: 'Italia',
        cap: '37100',
        latitude: 45.438,
        longitude: 10.992,
        sauHa: 5.5,
        superficieCatastaleMq: 55000,
        sezione: 'A',
        foglio: '10',
        particella: '250',
      },
    });
    console.log(`✅ Test field created: ${testFieldId} (campo vite)`);
    testProductId = randomUUID();
    await prisma.product.create({
      data: {
        id: testProductId,
        warehouseId: testWarehouseId,
        name: 'Rame Bordolese',
        category: 'PESTICIDE',
        type: 'Fungicida',
        registrationNumber: 'TEST-12345',
        sku: `SKU-${Date.now()}`,
      },
    });
    await prisma.stock.create({
      data: {
        productId: testProductId,
        type: 'IN',
        quantity: 100,
        unitOfMeasureQuantity: 'kg',
        price: 25.5,
        unitOfMeasurePrice: '€/kg',
      },
    });
    console.log(`✅ Test product created: ${testProductId} (Rame Bordolese) with 100kg stock`);
    testProductionUnitId = randomUUID();
    await prisma.productionUnit.create({
      data: {
        id: testProductionUnitId,
        name: 'Vite Cabernet 2024',
        areaHa: 5.5,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      },
    });
    await prisma.productionUnitOnField.create({
      data: {
        productionUnitId: testProductionUnitId,
        fieldId: testFieldId,
        areaHaOnField: 5.5,
      },
    });
    console.log(`✅ Test production unit created: ${testProductionUnitId} (Vite Cabernet 2024)`);
    testField2Id = randomUUID();
    await prisma.field.create({
      data: {
        id: testField2Id,
        companyId: testCompanyId,
        name: 'vigneto meridionale',
        address: 'Via Vigneto Sud 20',
        city: 'Verona',
        region: 'Veneto',
        nation: 'Italia',
        cap: '37100',
        latitude: 45.43,
        longitude: 10.98,
        sauHa: 3.0,
        superficieCatastaleMq: 30000,
        sezione: 'B',
        foglio: '11',
        particella: '260',
      },
    });
    console.log(`✅ Test field 2 created: ${testField2Id} (vigneto meridionale)`);
    testFieldGranoId = randomUUID();
    await prisma.field.create({
      data: {
        id: testFieldGranoId,
        companyId: testCompanyId,
        name: 'campo grano',
        address: 'Via Cereali 5',
        city: 'Mantova',
        region: 'Lombardia',
        nation: 'Italia',
        cap: '46100',
        latitude: 45.16,
        longitude: 10.79,
        sauHa: 10.0,
        superficieCatastaleMq: 100000,
        sezione: 'C',
        foglio: '20',
        particella: '300',
      },
    });
    console.log(`✅ Test field grano created: ${testFieldGranoId} (campo grano)`);
    console.log('✅ Test environment ready!\n');
  });
  afterEach(async () => {
    await prisma.fieldNote.deleteMany({
      where: { userId: testUserId },
    });
    console.log('🧹 Field notes cleaned up');
  });
  afterAll(async () => {
    console.log('\n🧹 Cleaning up test environment...');
    await prisma.stock.deleteMany({ where: { productId: testProductId } });
    await prisma.product.deleteMany({ where: { id: testProductId } });
    await prisma.productionUnitOnField.deleteMany({
      where: { productionUnitId: testProductionUnitId },
    });
    await prisma.productionUnit.deleteMany({ where: { id: testProductionUnitId } });
    await prisma.field.deleteMany({
      where: { id: { in: [testFieldId, testField2Id, testFieldGranoId] } },
    });
    await prisma.warehouse.deleteMany({ where: { id: testWarehouseId } });
    await deleteTestCompany(testCompanyId);
    await deleteTestUser();
    console.log('✅ Cleanup completed');
  });
  describe('Workflow Completo con LLM Reale', () => {
    it('dovrebbe classificare, cercare entità, e salvare una nota di operazione con rame', async () => {
      console.log('\n🧪 Test: Nota di operazione con rame nel campo vite');
      const threadId = `thread-${randomUUID()}`;
      const app = createFieldNoteAgentApp({
        userId: testUserId,
        prisma,
        modelName: LIVE_TEST_CHAT_MODEL,
        temperature: 0.1,
      });
      console.log('📤 Step 1: Invio messaggio "ho dato 10 kg di rame nel campo vite ieri"');
      const response1 = await handleUserMessage(
        app,
        threadId,
        'ho dato 10 kg di rame nel campo vite ieri',
      );
      console.log(`📥 Response 1 status: ${response1.status}`);
      console.log(`📝 Response 1 message preview: ${response1.message?.substring(0, 200)}...`);
      expect(response1.status).toBe('REQUIRES_APPROVAL');
      expect(response1.pendingToolCalls).toBeDefined();
      console.log('✅ Step 2: Approva classificazione');
      const response2 = await approveAndExecute(app, threadId);
      console.log(`📥 Response 2 status: ${response2.status}`);
      console.log(`📝 Response 2 message preview: ${response2.message?.substring(0, 200)}...`);
      if (response2.status === 'REQUIRES_APPROVAL') {
        console.log('✅ Step 3: Approva ricerca campi/prodotti');
        const response3 = await approveAndExecute(app, threadId);
        console.log(`📥 Response 3 status: ${response3.status}`);
        console.log(`📝 Response 3 message preview: ${response3.message?.substring(0, 200)}...`);
        if (response3.status === 'REQUIRES_APPROVAL') {
          console.log('✅ Step 4: Ulteriore approvazione');
          const response4 = await approveAndExecute(app, threadId);
          console.log(`📥 Response 4 status: ${response4.status}`);
        }
      }
      console.log('💾 Step final: Conferma salvataggio con "sì, salva"');
      const responseFinal = await handleUserMessage(app, threadId, 'sì, salva');
      console.log(`📥 Response final status: ${responseFinal.status}`);
      console.log(
        `📝 Response final message preview: ${responseFinal.message?.substring(0, 200)}...`,
      );
      if (responseFinal.status === 'REQUIRES_APPROVAL') {
        console.log('✅ Approva salvataggio finale');
        const saveResponse = await approveAndExecute(app, threadId);
        console.log(`📥 Save response status: ${saveResponse.status}`);
        expect(['COMPLETED', 'REQUIRES_APPROVAL']).toContain(saveResponse.status);
        if (saveResponse.status === 'REQUIRES_APPROVAL') {
          const finalSave = await approveAndExecute(app, threadId);
          console.log(`📥 Final save status: ${finalSave.status}`);
        }
      }
      console.log('🔍 Verifica salvataggio nel database...');
      const savedFieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
        include: {
          field: true,
          product: true,
        },
      });
      console.log(`📊 Field notes trovate: ${savedFieldNotes.length}`);
      expect(savedFieldNotes.length).toBeGreaterThan(0);
      const fieldNote = savedFieldNotes[0];
      console.log(`✅ Field note salvata: ${fieldNote.id}`);
      console.log(`   - Categoria: ${fieldNote.category}`);
      console.log(`   - Raw content: ${fieldNote.rawContent}`);
      console.log(`   - Campo collegato: ${fieldNote.field?.name || 'N/A'}`);
      console.log(`   - Prodotto collegato: ${fieldNote.product?.name || 'N/A'}`);
      console.log(`   - Status: ${fieldNote.status}`);
      expect(fieldNote.category).toBe(FieldNoteCategory.OPERATION);
      expect(fieldNote.rawContent).toContain('rame');
      expect(fieldNote.rawContent).toContain('campo vite');
      expect(fieldNote.status).toBe('PROCESSED');
      expect(fieldNote.userId).toBe(testUserId);
    });});});
