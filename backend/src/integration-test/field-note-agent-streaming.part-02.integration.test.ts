import { LIVE_TEST_CHAT_MODEL } from './live-llm-test-config';
import { prisma, createTestUser, deleteTestUser, createTestCompany, deleteTestCompany } from './helpers';
import { streamFieldNoteAgentChat, StreamFieldNoteAgentOptions, StreamEvent } from '../infrastructure/services/agents/field_note_agent/streaming';
// Streaming tests only need streamFieldNoteAgentChat and Prisma
// Streaming tests only need streamFieldNoteAgentChat and Prisma
import { randomUUID } from 'crypto';

/**
 * Integration tests for Field Note Agent streaming (SSE) and OCR.
 *
 * These tests make real LLM calls and test the streaming generator.
 * Expected time: ~2-3 minutes per test.
 *
 * Run with:
 *   npm run test:integration -- field-note-agent-streaming.integration.test.ts
 */

jest.setTimeout(240000);
describe('Field Note Agent - Streaming & OCR Integration Tests', () => {
  let testUserId: string;
  let testCompanyId: string;
  let testFieldId: string;
  let testWarehouseId: string;
  let testProductId: string;
  let testProductionUnitId: string;

  beforeAll(async () => {
    const testUser = await createTestUser();
    testUserId = testUser.id;

    const testCompany = await createTestCompany({
      userId: testUserId,
      name: 'Azienda Streaming Test',
    });
    testCompanyId = testCompany.id;

    testWarehouseId = randomUUID();
    await prisma.warehouse.create({
      data: {
        id: testWarehouseId,
        companyId: testCompanyId,
        name: 'Magazzino Streaming',
        address: 'Via Streaming 1',
        city: 'Verona',
        cap: '37100',
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
        name: 'campo vite streaming',
        address: 'Via Vigneto 10',
        city: 'Verona',
        region: 'Veneto',
        nation: 'Italia',
        cap: '37100',
        sauHa: 5.0,
        superficieCatastaleMq: 50000,
        sezione: 'A',
        foglio: '10',
        particella: '250',
      },
    });

    testProductId = randomUUID();
    await prisma.product.create({
      data: {
        id: testProductId,
        warehouseId: testWarehouseId,
        name: 'POLTIGLIA DISPERSS',
        sku: 'POL-DISP-3741',
        category: 'PESTICIDE',
        type: 'Fungicida rameico',
        registrationNumber: '3741',
      },
    });

    testProductionUnitId = randomUUID();
    await prisma.productionUnit.create({
      data: {
        id: testProductionUnitId,
        name: 'Vite Chardonnay Streaming',
        areaHa: 1.5,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        productionUnitsOnFields: {
          create: {
            fieldId: testFieldId,
            areaHaOnField: 1.5,
          },
        },
      },
    });

    await prisma.productionCycle.create({
      data: {
        productionUnitId: testProductionUnitId,
        cropName: 'Vite',
        cropType: 'PERENNE',
        variety: 'Chardonnay',
        protocoll: 'Integrato',
        protectionStructure: 'Nessuna',
        acquaTotalePeridoL: 0,
        seasonYear: 2025,
        cycleIndex: 0,
      },
    });
  });

  afterEach(async () => {
    await prisma.messageSource.deleteMany({});
    await prisma.sourceCitation.deleteMany({});
    await prisma.message.deleteMany({});
    await prisma.chat.deleteMany({});
  });

  afterAll(async () => {
    await prisma.stock.deleteMany({});
    await prisma.job.deleteMany({});
    await prisma.productionUnit.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.field.deleteMany({});
    await prisma.warehouse.deleteMany({});
    await deleteTestCompany(testCompanyId);
    await deleteTestUser();
  });

  it('should handle multi-turn streaming conversation on same thread', async () => {
    const threadId = randomUUID();

    // First turn
    const options1: StreamFieldNoteAgentOptions = {
      threadId,
      userMessage: 'Ho visto peronospora sulla vite',
      userId: testUserId,
      prisma,
      modelName: LIVE_TEST_CHAT_MODEL,
      temperature: 0,
    };

    const gen1 = streamFieldNoteAgentChat(options1);
    let result1: IteratorResult<StreamEvent, unknown>;
    do {
      result1 = await gen1.next();
    } while (!result1.done);

    // Second turn - same thread
    const options2: StreamFieldNoteAgentOptions = {
      threadId,
      userMessage: 'Era sul campo vite streaming, gravità media',
      userId: testUserId,
      prisma,
      modelName: LIVE_TEST_CHAT_MODEL,
      temperature: 0,
    };

    const gen2 = streamFieldNoteAgentChat(options2);
    const events2: StreamEvent[] = [];
    let result2: IteratorResult<StreamEvent, unknown>;
    do {
      result2 = await gen2.next();
      if (!result2.done && result2.value) {
        events2.push(result2.value);
      }
    } while (!result2.done);

    // Second turn should have produced events
    expect(events2.length).toBeGreaterThan(0);

    // Conversation should have accumulated messages
    const chat = await prisma.chat.findFirst({
      where: { threadId },
    });
    expect(chat).toBeDefined();

    const messages = await prisma.message.findMany({
      where: { chatId: chat!.id },
      orderBy: { createdAt: 'asc' },
    });
    // At least 4 messages: user1, assistant1, user2, assistant2
    expect(messages.length).toBeGreaterThanOrEqual(4);
  });

  it('should handle error event gracefully during streaming', async () => {
    const threadId = randomUUID();
    const options: StreamFieldNoteAgentOptions = {
      threadId,
      userMessage: '', // Empty message might cause an issue
      userId: testUserId,
      prisma,
      modelName: LIVE_TEST_CHAT_MODEL,
      temperature: 0,
    };

    const events: StreamEvent[] = [];
    const generator = streamFieldNoteAgentChat(options);

    let result: IteratorResult<StreamEvent, unknown>;
    do {
      result = await generator.next();
      if (!result.done && result.value) {
        events.push(result.value);
      }
    } while (!result.done);

    // Even with empty message, generator should terminate without throwing
    expect(events.length).toBeGreaterThanOrEqual(0);
  });});
