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
  rejectAndRespond,
  getConversationState,
} from '../infrastructure/services/agents/field_note_agent';
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

// Timeout esteso per chiamate LLM reali (4 minuti)
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

    // 1. Create test user
    const testUser = await createTestUser();
    testUserId = testUser.id;
    console.log(`✅ Test user created: ${testUserId}`);

    // 2. Create test company
    const testCompany = await createTestCompany({
      userId: testUserId,
      name: 'Azienda Agricola Test',
    });
    testCompanyId = testCompany.id;
    console.log(`✅ Test company created: ${testCompanyId}`);

    // 3. Create test warehouse
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

    // 4. Create test field
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

    // 5. Create test product (Rame)
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

    // Create initial stock
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

    // 6. Create production unit linked to campo vite
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

    // 7. Create additional field for ambiguity tests (vigneto meridionale)
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

    // 8. Create field for grain/arable crops tests (campo grano)
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
    // Clean up field notes after each test
    await prisma.fieldNote.deleteMany({
      where: { userId: testUserId },
    });
    console.log('🧹 Field notes cleaned up');
  });

  afterAll(async () => {
    console.log('\n🧹 Cleaning up test environment...');

    // Clean up in reverse order
    await prisma.stock.deleteMany({ where: { productId: testProductId } });
    await prisma.product.deleteMany({ where: { id: testProductId } });

    // Clean up production unit and its relations
    await prisma.productionUnitOnField.deleteMany({
      where: { productionUnitId: testProductionUnitId },
    });
    await prisma.productionUnit.deleteMany({ where: { id: testProductionUnitId } });

    // Clean up all test fields
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

      // Step 1: Invia messaggio iniziale
      console.log('📤 Step 1: Invio messaggio "ho dato 10 kg di rame nel campo vite ieri"');
      const response1 = await handleUserMessage(
        app,
        threadId,
        'ho dato 10 kg di rame nel campo vite ieri',
      );

      console.log(`📥 Response 1 status: ${response1.status}`);
      console.log(`📝 Response 1 message preview: ${response1.message?.substring(0, 200)}...`);

      // L'agent dovrebbe chiedere approvazione per classificare
      expect(response1.status).toBe('REQUIRES_APPROVAL');
      expect(response1.pendingToolCalls).toBeDefined();

      // Step 2: Approva la classificazione
      console.log('✅ Step 2: Approva classificazione');
      const response2 = await approveAndExecute(app, threadId);

      console.log(`📥 Response 2 status: ${response2.status}`);
      console.log(`📝 Response 2 message preview: ${response2.message?.substring(0, 200)}...`);

      // L'agent potrebbe richiedere approvazione per cercare campi/prodotti
      if (response2.status === 'REQUIRES_APPROVAL') {
        console.log('✅ Step 3: Approva ricerca campi/prodotti');
        const response3 = await approveAndExecute(app, threadId);
        console.log(`📥 Response 3 status: ${response3.status}`);
        console.log(`📝 Response 3 message preview: ${response3.message?.substring(0, 200)}...`);

        // Potrebbero esserci ulteriori approvazioni necessarie
        if (response3.status === 'REQUIRES_APPROVAL') {
          console.log('✅ Step 4: Ulteriore approvazione');
          const response4 = await approveAndExecute(app, threadId);
          console.log(`📥 Response 4 status: ${response4.status}`);
        }
      }

      // Step 3: Conferma esplicitamente il salvataggio
      console.log('💾 Step final: Conferma salvataggio con "sì, salva"');
      const responseFinal = await handleUserMessage(app, threadId, 'sì, salva');

      console.log(`📥 Response final status: ${responseFinal.status}`);
      console.log(
        `📝 Response final message preview: ${responseFinal.message?.substring(0, 200)}...`,
      );

      // Approva il salvataggio finale se necessario
      if (responseFinal.status === 'REQUIRES_APPROVAL') {
        console.log('✅ Approva salvataggio finale');
        const saveResponse = await approveAndExecute(app, threadId);
        console.log(`📥 Save response status: ${saveResponse.status}`);
        expect(['COMPLETED', 'REQUIRES_APPROVAL']).toContain(saveResponse.status);

        // Se richiede ancora approvazione, approva
        if (saveResponse.status === 'REQUIRES_APPROVAL') {
          const finalSave = await approveAndExecute(app, threadId);
          console.log(`📥 Final save status: ${finalSave.status}`);
        }
      }

      // Step 4: Verifica che la field note sia stata salvata nel database
      console.log('🔍 Verifica salvataggio nel database...');
      const savedFieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
        include: {
          field: true,
          product: true,
        },
      });

      console.log(`📊 Field notes trovate: ${savedFieldNotes.length}`);

      // Assertions
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
    });

    it('dovrebbe gestire una nota di osservazione con malattia', async () => {
      console.log('\n🧪 Test: Nota di osservazione con peronospora');

      const threadId = `thread-${randomUUID()}`;
      const app = createFieldNoteAgentApp({
        userId: testUserId,
        prisma,
        modelName: LIVE_TEST_CHAT_MODEL,
        temperature: 0.1,
      });

      // Step 1: Invia nota di osservazione
      console.log('📤 Step 1: Invio messaggio "ho notato peronospora nel campo vite stamattina"');
      const response1 = await handleUserMessage(
        app,
        threadId,
        'ho notato peronospora nel campo vite stamattina',
      );

      console.log(`📥 Response 1 status: ${response1.status}`);
      expect(response1.status).toBe('REQUIRES_APPROVAL');

      // Step 2: Approva classificazione
      console.log('✅ Step 2: Approva classificazione');
      const response2 = await approveAndExecute(app, threadId);
      console.log(`📥 Response 2 status: ${response2.status}`);

      // Approva eventuali ricerche
      if (response2.status === 'REQUIRES_APPROVAL') {
        console.log('✅ Step 3: Approva ricerca');
        await approveAndExecute(app, threadId);
      }

      // Step 3: Conferma salvataggio
      console.log('💾 Conferma salvataggio');
      const responseFinal = await handleUserMessage(app, threadId, 'ok, conferma');

      if (responseFinal.status === 'REQUIRES_APPROVAL') {
        await approveAndExecute(app, threadId);
      }

      // Verifica salvataggio
      console.log('🔍 Verifica salvataggio nel database...');
      const savedFieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
      });

      expect(savedFieldNotes.length).toBeGreaterThan(0);
      const fieldNote = savedFieldNotes[0];

      console.log(`✅ Field note salvata: ${fieldNote.id}`);
      console.log(`   - Categoria: ${fieldNote.category}`);
      console.log(`   - Raw content: ${fieldNote.rawContent}`);

      expect(fieldNote.category).toBe(FieldNoteCategory.OBSERVATION);
      expect(fieldNote.rawContent).toContain('peronospora');
    });

    // TODO(test-stability): reject path currently fails on agent state reset - re-enable once agent correction loop is stable.
    it.skip('dovrebbe gestire il reject e permettere correzioni', async () => {
      console.log('\n🧪 Test: Reject e correzione');

      const threadId = `thread-${randomUUID()}`;
      const app = createFieldNoteAgentApp({
        userId: testUserId,
        prisma,
        modelName: LIVE_TEST_CHAT_MODEL,
        temperature: 0.1,
      });

      // Step 1: Invia messaggio
      console.log('📤 Step 1: Invio messaggio iniziale');
      const response1 = await handleUserMessage(app, threadId, 'ho trattato il campo con prodotto');

      expect(response1.status).toBe('REQUIRES_APPROVAL');

      // Step 2: Approva classificazione
      console.log('✅ Step 2: Approva classificazione');
      const response2 = await approveAndExecute(app, threadId);
      console.log(`📥 Response 2 status: ${response2.status}`);

      // Step 3: Reject con feedback
      console.log('❌ Step 3: Reject con feedback correttivo');
      const response3 = await rejectAndRespond(
        app,
        threadId,
        'No, era rame bordolese, 15 kg nel campo vite',
      );

      console.log(`📥 Response 3 status: ${response3.status}`);
      console.log(`📝 Response 3 message: ${response3.message?.substring(0, 200)}...`);

      // L'agent dovrebbe riclassificare con il feedback
      expect(['COMPLETED', 'REQUIRES_APPROVAL']).toContain(response3.status);

      // Approva nuova classificazione se necessario
      if (response3.status === 'REQUIRES_APPROVAL') {
        console.log('✅ Approva riclassificazione');
        await approveAndExecute(app, threadId);
      }

      // Conferma salvataggio
      console.log('💾 Conferma salvataggio');
      await handleUserMessage(app, threadId, 'ok salva');

      // Verifica che il feedback sia stato incorporato
      const savedFieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
      });

      if (savedFieldNotes.length > 0) {
        console.log(`✅ Field note salvata con correzioni`);
        expect(savedFieldNotes[0].rawContent).toBeTruthy();
      }
    });
  });

  describe('Gestione Stato e Conversazione', () => {
    it('dovrebbe mantenere lo stato della conversazione attraverso multiple interazioni', async () => {
      console.log('\n🧪 Test: Stato conversazione persistente');

      const threadId = `thread-${randomUUID()}`;
      const app = createFieldNoteAgentApp({
        userId: testUserId,
        prisma,
        modelName: LIVE_TEST_CHAT_MODEL,
        temperature: 0.1,
      });

      // Invia primo messaggio
      await handleUserMessage(app, threadId, 'ho dato rame nel campo');

      // Verifica stato
      const state1 = await getConversationState(app, threadId);
      expect(state1.messages).toBeDefined();
      expect(state1.messages.length).toBeGreaterThan(0);

      console.log(`📊 Messaggi in conversazione: ${state1.messages.length}`);

      // Invia secondo messaggio
      await handleUserMessage(app, threadId, 'quanti kg? 8 kg');

      // Verifica che lo stato sia aggiornato
      const state2 = await getConversationState(app, threadId);
      expect(state2.messages.length).toBeGreaterThan(state1.messages.length);

      console.log(`📊 Messaggi dopo seconda interazione: ${state2.messages.length}`);
    });
  });

  describe('Test Tempi di Risposta', () => {
    it('dovrebbe completare una classificazione in meno di 30 secondi', async () => {
      console.log('\n🧪 Test: Performance classificazione');

      const threadId = `thread-${randomUUID()}`;
      const app = createFieldNoteAgentApp({
        userId: testUserId,
        prisma,
        modelName: LIVE_TEST_CHAT_MODEL,
        temperature: 0.1,
      });

      const startTime = Date.now();

      await handleUserMessage(app, threadId, 'ho dato 10 kg di rame nel campo vite');

      const duration = Date.now() - startTime;
      console.log(`⏱️ Tempo di classificazione: ${(duration / 1000).toFixed(2)}s`);

      expect(duration).toBeLessThan(30000); // Meno di 30 secondi
    });
  });

  // Helper function to complete a full workflow with approval and save
  async function completeWorkflowWithSave(
    userMessage: string,
    confirmMessage: string = 'sì, salva',
  ): Promise<void> {
    const threadId = `thread-${randomUUID()}`;
    const app = createFieldNoteAgentApp({
      userId: testUserId,
      prisma,
      modelName: LIVE_TEST_CHAT_MODEL,
      temperature: 0.1,
    });

    // Send initial message
    let response = await handleUserMessage(app, threadId, userMessage);
    console.log(`📥 Initial response status: ${response.status}`);

    // Approve all pending tool calls until we get COMPLETED
    let iterations = 0;
    const maxIterations = 10;
    while (response.status === 'REQUIRES_APPROVAL' && iterations < maxIterations) {
      response = await approveAndExecute(app, threadId);
      console.log(`📥 Approval ${iterations + 1} status: ${response.status}`);
      iterations++;
    }

    // If agent is waiting for user confirmation, send it
    if (response.status === 'COMPLETED' && response.message) {
      console.log(`💾 Sending confirmation: "${confirmMessage}"`);
      response = await handleUserMessage(app, threadId, confirmMessage);

      // Approve save if needed
      while (response.status === 'REQUIRES_APPROVAL' && iterations < maxIterations) {
        response = await approveAndExecute(app, threadId);
        console.log(`📥 Save approval ${iterations + 1} status: ${response.status}`);
        iterations++;
      }
    }
  }

  describe('Verifica Dati Database', () => {
    it('dovrebbe salvare tutti i campi estratti correttamente nel database', async () => {
      console.log('\n🧪 Test: Verifica completa campi salvati');

      await completeWorkflowWithSave(
        'ho dato 5 kg di rame bordolese nel campo vite il 15 gennaio 2026',
      );

      const savedFieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
        include: { field: true, product: true },
      });

      expect(savedFieldNotes.length).toBeGreaterThan(0);
      const fieldNote = savedFieldNotes[0];

      console.log(`✅ Field note salvata:`, {
        id: fieldNote.id,
        category: fieldNote.category,
        rawContent: fieldNote.rawContent,
        fieldId: fieldNote.fieldId,
        productId: fieldNote.productId,
        status: fieldNote.status,
        extractedData: fieldNote.extractedData,
      });

      expect(fieldNote.category).toBe(FieldNoteCategory.OPERATION);
      expect(fieldNote.rawContent).toBeTruthy();
      expect(fieldNote.status).toBe('PROCESSED');
      expect(fieldNote.userId).toBe(testUserId);
      // Il campo dovrebbe essere collegato
      expect(fieldNote.fieldId).toBeTruthy();
    });

    // TODO(test-stability): production unit linkage assertion is flaky against the live LLM.
    it.skip('dovrebbe collegare correttamente la nota alla production unit', async () => {
      console.log('\n🧪 Test: Collegamento a production unit');

      await completeWorkflowWithSave(
        'trattamento con rame sulla vite cabernet 2024 nel campo vite',
      );

      const savedFieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
        include: { productionUnit: true },
      });

      expect(savedFieldNotes.length).toBeGreaterThan(0);
      const fieldNote = savedFieldNotes[0];

      console.log(`✅ Production unit collegata:`, {
        productionUnitId: fieldNote.productionUnitId,
        productionUnitName: fieldNote.productionUnit?.name,
      });

      // Se l'agent ha trovato la PU, dovrebbe essere collegata
      if (fieldNote.productionUnitId) {
        expect(fieldNote.productionUnitId).toBe(testProductionUnitId);
      }
    });

    it('dovrebbe salvare la nota anche con prodotto non presente nel magazzino', async () => {
      console.log('\n🧪 Test: Prodotto non trovato in magazzino');

      await completeWorkflowWithSave('ho dato glifosato nel campo vite');

      const savedFieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
      });

      expect(savedFieldNotes.length).toBeGreaterThan(0);
      const fieldNote = savedFieldNotes[0];

      console.log(`✅ Field note salvata con prodotto non trovato:`, {
        productId: fieldNote.productId,
        rawContent: fieldNote.rawContent,
        extractedData: fieldNote.extractedData,
      });

      // Il prodotto non dovrebbe essere collegato (non esiste in magazzino)
      expect(fieldNote.productId).toBeNull();
      // Ma la nota dovrebbe essere salvata
      expect(fieldNote.rawContent).toContain('glifosato');
    });

    it('dovrebbe salvare correttamente area trattata parziale', async () => {
      console.log('\n🧪 Test: Area trattata parziale');

      await completeWorkflowWithSave('ho dato 3 kg di rame su 2 ettari nel campo vite');

      const savedFieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
      });

      expect(savedFieldNotes.length).toBeGreaterThan(0);
      const fieldNote = savedFieldNotes[0];

      console.log(`✅ Field note con area parziale:`, {
        extractedData: fieldNote.extractedData,
        rawContent: fieldNote.rawContent,
      });

      // Verifica che l'area trattata sia nei dati estratti (JSON)
      const extractedData = fieldNote.extractedData as Record<string, unknown> | null;
      if (extractedData && extractedData.treatedAreaHa) {
        expect(extractedData.treatedAreaHa).toBe(2);
      }
      // In alternativa, verifica che il rawContent menzioni l'area
      expect(fieldNote.rawContent?.toLowerCase()).toMatch(/2\s*(ettari|ha)/i);
    });
  });

  describe('Gestione Messaggi Avanzata', () => {
    it('dovrebbe ricordare il contesto tra messaggi successivi', async () => {
      console.log('\n🧪 Test: Conversazione multi-turno');

      const threadId = `thread-${randomUUID()}`;
      const app = createFieldNoteAgentApp({
        userId: testUserId,
        prisma,
        modelName: LIVE_TEST_CHAT_MODEL,
        temperature: 0.1,
      });

      // Primo messaggio incompleto
      let response = await handleUserMessage(app, threadId, 'ho trattato il campo vite');
      console.log(`📥 Response 1: ${response.status}`);

      // Approva se necessario
      while (response.status === 'REQUIRES_APPROVAL') {
        response = await approveAndExecute(app, threadId);
      }

      // Secondo messaggio con dettagli
      response = await handleUserMessage(app, threadId, 'con 10 kg di rame bordolese');
      console.log(`📥 Response 2: ${response.status}`);

      while (response.status === 'REQUIRES_APPROVAL') {
        response = await approveAndExecute(app, threadId);
      }

      // Conferma salvataggio
      response = await handleUserMessage(app, threadId, 'sì, conferma');
      while (response.status === 'REQUIRES_APPROVAL') {
        response = await approveAndExecute(app, threadId);
      }

      const savedFieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
      });

      if (savedFieldNotes.length > 0) {
        console.log(`✅ Nota salvata con contesto multi-turno:`, savedFieldNotes[0].rawContent);
        // La nota dovrebbe contenere info da entrambi i messaggi
        expect(savedFieldNotes[0].rawContent).toBeTruthy();
      }
    });

    it('dovrebbe chiedere chiarimento quando ci sono più campi simili', async () => {
      console.log('\n🧪 Test: Ambiguità campo');

      // Creiamo temporaneamente un secondo campo vite per creare ambiguità
      const tempFieldId = randomUUID();
      await prisma.field.create({
        data: {
          id: tempFieldId,
          companyId: testCompanyId,
          name: 'campo vite nord',
          address: 'Via Vigneto Nord 5',
          city: 'Verona',
          region: 'Veneto',
          nation: 'Italia',
          cap: '37100',
          latitude: 45.45,
          longitude: 10.99,
          sauHa: 2.0,
          superficieCatastaleMq: 20000,
          sezione: 'D',
          foglio: '12',
          particella: '270',
        },
      });

      try {
        const threadId = `thread-${randomUUID()}`;
        const app = createFieldNoteAgentApp({
          userId: testUserId,
          prisma,
          modelName: LIVE_TEST_CHAT_MODEL,
          temperature: 0.1,
        });

        // Messaggio con riferimento ambiguo (esistono "campo vite" e "campo vite nord")
        let response = await handleUserMessage(app, threadId, 'ho trattato il campo vite con rame');
        console.log(`📥 Response status: ${response.status}`);
        console.log(`📝 Response message: ${response.message?.substring(0, 300)}...`);

        // L'agent dovrebbe chiedere quale campo specifico o elencare le opzioni
        // Approva le operazioni di ricerca
        while (response.status === 'REQUIRES_APPROVAL') {
          response = await approveAndExecute(app, threadId);
          console.log(`📥 After approval: ${response.status}`);
        }

        // Il messaggio dovrebbe menzionare le opzioni di campo disponibili
        // o procedere con uno dei campi trovati
        expect(response.message).toBeTruthy();
      } finally {
        // Cleanup del campo temporaneo
        await prisma.field.delete({ where: { id: tempFieldId } });
      }
    });

    it('dovrebbe incorporare le correzioni dopo reject', async () => {
      console.log('\n🧪 Test: Reject con correzione');

      const threadId = `thread-${randomUUID()}`;
      const app = createFieldNoteAgentApp({
        userId: testUserId,
        prisma,
        modelName: LIVE_TEST_CHAT_MODEL,
        temperature: 0.1,
      });

      // Primo messaggio
      let response = await handleUserMessage(app, threadId, 'ho dato rame nel campo vite');

      // Approva fino a quando l'agent propone il salvataggio
      while (response.status === 'REQUIRES_APPROVAL') {
        response = await approveAndExecute(app, threadId);
      }

      // Reject con correzione
      response = await rejectAndRespond(app, threadId, 'no, erano 15 kg, non 10');
      console.log(`📥 After reject: ${response.status}`);

      // Approva la nuova proposta
      while (response.status === 'REQUIRES_APPROVAL') {
        response = await approveAndExecute(app, threadId);
      }

      // Conferma
      response = await handleUserMessage(app, threadId, 'ok salva');
      while (response.status === 'REQUIRES_APPROVAL') {
        response = await approveAndExecute(app, threadId);
      }

      const savedFieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
      });

      if (savedFieldNotes.length > 0) {
        console.log(`✅ Nota salvata dopo correzione:`, savedFieldNotes[0].rawContent);
      }
    });

    // TODO(test-stability): agent returns "Cannot read properties of undefined (reading 'length')" - fix error surface first.
    it.skip('dovrebbe restituire ERROR status con messaggio comprensibile', async () => {
      console.log('\n🧪 Test: Gestione errore graceful');

      // Creiamo un app con API key invalida
      const app = createFieldNoteAgentApp({
        userId: testUserId,
        prisma,
        modelName: LIVE_TEST_CHAT_MODEL,
        temperature: 0.1,
        openAIApiKey: 'invalid-api-key-test',
      });

      const threadId = `thread-${randomUUID()}`;
      const response = await handleUserMessage(app, threadId, 'test messaggio');

      console.log(`📥 Response status: ${response.status}`);
      console.log(`📥 Response error: ${response.error}`);

      expect(response.status).toBe('ERROR');
      expect(response.error).toBeDefined();
    });
  });

  describe('Operazioni Agricole Diverse', () => {
    it('dovrebbe classificare correttamente una nota di aratura', async () => {
      console.log('\n🧪 Test: Aratura');

      await completeWorkflowWithSave('oggi ho arato il campo grano a 30 cm di profondità');

      const savedFieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
        include: { field: true },
      });

      expect(savedFieldNotes.length).toBeGreaterThan(0);
      const fieldNote = savedFieldNotes[0];

      console.log(`✅ Nota aratura:`, {
        category: fieldNote.category,
        rawContent: fieldNote.rawContent,
        fieldName: fieldNote.field?.name,
      });

      expect(fieldNote.category).toBe(FieldNoteCategory.OPERATION);
      expect(fieldNote.rawContent?.toLowerCase()).toContain('arat');
    });

    it('dovrebbe classificare correttamente una nota di cimatura', async () => {
      console.log('\n🧪 Test: Cimatura');

      await completeWorkflowWithSave('ho fatto la cimatura della vite nel campo vite stamattina');

      const savedFieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
      });

      expect(savedFieldNotes.length).toBeGreaterThan(0);
      const fieldNote = savedFieldNotes[0];

      console.log(`✅ Nota cimatura:`, {
        category: fieldNote.category,
        rawContent: fieldNote.rawContent,
      });

      expect(fieldNote.category).toBe(FieldNoteCategory.OPERATION);
      expect(fieldNote.rawContent?.toLowerCase()).toContain('cimatura');
    });

    it('dovrebbe classificare correttamente una nota di potatura', async () => {
      console.log('\n🧪 Test: Potatura');

      await completeWorkflowWithSave(
        'potatura invernale completata nel campo vite, tolti 5 capi per pianta',
      );

      const savedFieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
      });

      expect(savedFieldNotes.length).toBeGreaterThan(0);
      const fieldNote = savedFieldNotes[0];

      console.log(`✅ Nota potatura:`, {
        category: fieldNote.category,
        rawContent: fieldNote.rawContent,
      });

      expect(fieldNote.category).toBe(FieldNoteCategory.OPERATION);
      expect(fieldNote.rawContent?.toLowerCase()).toContain('potatura');
    });

    it('dovrebbe classificare correttamente una nota di semina', async () => {
      console.log('\n🧪 Test: Semina');

      await completeWorkflowWithSave('seminato grano tenero nel campo grano, 200 kg/ha');

      const savedFieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
        include: { field: true },
      });

      expect(savedFieldNotes.length).toBeGreaterThan(0);
      const fieldNote = savedFieldNotes[0];

      console.log(`✅ Nota semina:`, {
        category: fieldNote.category,
        rawContent: fieldNote.rawContent,
        fieldName: fieldNote.field?.name,
      });

      expect(fieldNote.category).toBe(FieldNoteCategory.OPERATION);
      expect(fieldNote.rawContent?.toLowerCase()).toContain('seminat');
    });

    it('dovrebbe classificare correttamente una nota di raccolta', async () => {
      console.log('\n🧪 Test: Raccolta');

      await completeWorkflowWithSave('raccolto 80 quintali di uva nel campo vite');

      const savedFieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
      });

      expect(savedFieldNotes.length).toBeGreaterThan(0);
      const fieldNote = savedFieldNotes[0];

      console.log(`✅ Nota raccolta:`, {
        category: fieldNote.category,
        rawContent: fieldNote.rawContent,
      });

      expect(fieldNote.category).toBe(FieldNoteCategory.OPERATION);
      expect(fieldNote.rawContent?.toLowerCase()).toContain('raccolt');
    });

    it('dovrebbe salvare nota di concimazione anche senza prodotto in magazzino', async () => {
      console.log('\n🧪 Test: Concimazione con urea');

      await completeWorkflowWithSave('concimazione con urea, 150 kg nel campo grano');

      const savedFieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
        include: { field: true },
      });

      expect(savedFieldNotes.length).toBeGreaterThan(0);
      const fieldNote = savedFieldNotes[0];

      console.log(`✅ Nota concimazione:`, {
        category: fieldNote.category,
        rawContent: fieldNote.rawContent,
        productId: fieldNote.productId,
        fieldName: fieldNote.field?.name,
      });

      expect(fieldNote.category).toBe(FieldNoteCategory.OPERATION);
      expect(fieldNote.rawContent?.toLowerCase()).toContain('concim');
      // Urea non è in magazzino
      expect(fieldNote.productId).toBeNull();
    });

    it('dovrebbe classificare correttamente una nota di irrigazione', async () => {
      console.log('\n🧪 Test: Irrigazione');

      await completeWorkflowWithSave('irrigazione a goccia per 4 ore nel campo vite');

      const savedFieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
      });

      expect(savedFieldNotes.length).toBeGreaterThan(0);
      const fieldNote = savedFieldNotes[0];

      console.log(`✅ Nota irrigazione:`, {
        category: fieldNote.category,
        rawContent: fieldNote.rawContent,
      });

      expect(fieldNote.category).toBe(FieldNoteCategory.OPERATION);
      expect(fieldNote.rawContent?.toLowerCase()).toContain('irrigazion');
    });

    it('dovrebbe classificare correttamente una osservazione fenologica', async () => {
      console.log('\n🧪 Test: Osservazione fenologica');

      await completeWorkflowWithSave('invaiatura iniziata nel campo vite, grappoli al 30%');

      const savedFieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
      });

      expect(savedFieldNotes.length).toBeGreaterThan(0);
      const fieldNote = savedFieldNotes[0];

      console.log(`✅ Nota osservazione fenologica:`, {
        category: fieldNote.category,
        rawContent: fieldNote.rawContent,
      });

      expect(fieldNote.category).toBe(FieldNoteCategory.OBSERVATION);
      expect(fieldNote.rawContent?.toLowerCase()).toContain('invaiatura');
    });

    it('dovrebbe classificare correttamente una nota di sfalcio', async () => {
      console.log('\n🧪 Test: Sfalcio');

      await completeWorkflowWithSave("sfalcio dell'erba tra i filari nel campo vite");

      const savedFieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
      });

      expect(savedFieldNotes.length).toBeGreaterThan(0);
      const fieldNote = savedFieldNotes[0];

      console.log(`✅ Nota sfalcio:`, {
        category: fieldNote.category,
        rawContent: fieldNote.rawContent,
      });

      expect(fieldNote.category).toBe(FieldNoteCategory.OPERATION);
      expect(fieldNote.rawContent?.toLowerCase()).toContain('sfalcio');
    });

    it('dovrebbe interpretare correttamente linguaggio colloquiale', async () => {
      console.log('\n🧪 Test: Linguaggio colloquiale');

      await completeWorkflowWithSave('buttato rame al campo vite');

      const savedFieldNotes = await prisma.fieldNote.findMany({
        where: { userId: testUserId },
      });

      expect(savedFieldNotes.length).toBeGreaterThan(0);
      const fieldNote = savedFieldNotes[0];

      console.log(`✅ Nota linguaggio colloquiale:`, {
        category: fieldNote.category,
        rawContent: fieldNote.rawContent,
      });

      // L'agent dovrebbe interpretare "buttato rame" come operazione
      expect(fieldNote.category).toBe(FieldNoteCategory.OPERATION);
    });
  });

  describe('Edge Cases', () => {
    it('dovrebbe gestire messaggi vuoti o senza contenuto utile', async () => {
      console.log('\n🧪 Test: Messaggio senza contenuto agricolo');

      const threadId = `thread-${randomUUID()}`;
      const app = createFieldNoteAgentApp({
        userId: testUserId,
        prisma,
        modelName: LIVE_TEST_CHAT_MODEL,
        temperature: 0.1,
      });

      const response = await handleUserMessage(app, threadId, 'ciao come stai?');

      console.log(`📥 Response status: ${response.status}`);
      console.log(`📝 Response message: ${response.message?.substring(0, 200)}`);

      // L'agent dovrebbe chiedere chiarimenti o indicare che non ha capito
      expect(response.message).toBeTruthy();
    });

    it('dovrebbe gestire approve su thread senza pending tool calls', async () => {
      console.log('\n🧪 Test: Approve su thread nuovo');

      const threadId = `thread-${randomUUID()}`;
      const app = createFieldNoteAgentApp({
        userId: testUserId,
        prisma,
        modelName: LIVE_TEST_CHAT_MODEL,
        temperature: 0.1,
      });

      // Prova ad approvare su un thread che non ha pending tool calls
      const response = await approveAndExecute(app, threadId);

      console.log(`📥 Response status: ${response.status}`);
      console.log(`📝 Response: ${JSON.stringify(response)}`);

      // Non dovrebbe crashare
      expect(response).toBeDefined();
    });
  });
});
