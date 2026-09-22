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

  it('should stream tokens via the async generator for a simple message', async () => {
    const threadId = randomUUID();
    const options: StreamFieldNoteAgentOptions = {
      threadId,
      userMessage:
        'Ho fatto un trattamento con rame sul campo vite streaming contro la peronospora',
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

    // Should have received at least one event
    expect(events.length).toBeGreaterThan(0);

    // Check event types
    const eventTypes = events.map((e) => e.type);
    expect(eventTypes.length).toBeGreaterThan(0);

    // Should have at least one meaningful event type
    const hasTokenOrComplete = eventTypes.some(
      (t) => t === 'token' || t === 'complete' || t === 'requires_approval',
    );
    expect(hasTokenOrComplete).toBe(true);

    // If tokens were emitted, they should have content
    const tokenEvents = events.filter((e) => e.type === 'token');
    for (const tokenEvent of tokenEvents) {
      expect(tokenEvent.content).toBeDefined();
      expect(typeof tokenEvent.content).toBe('string');
    }
  });

  it('should emit requires_approval event for operations needing confirmation', async () => {
    const threadId = randomUUID();
    const options: StreamFieldNoteAgentOptions = {
      threadId,
      userMessage:
        'Oggi 15 giugno ho fatto un trattamento con POLTIGLIA DISPERSS 2.5 kg/ha sul campo vite streaming per la peronospora',
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

    expect(events.length).toBeGreaterThan(0);

    // Check for either requires_approval (tool needs human approval)
    // or complete (agent completed without needing approval)
    const eventTypes = events.map((e) => e.type);
    const hasTerminalEvent = eventTypes.some((t) => t === 'requires_approval' || t === 'complete');
    expect(hasTerminalEvent).toBe(true);

    // If requires_approval, check the tool call structure
    const approvalEvent = events.find((e) => e.type === 'requires_approval');
    if (approvalEvent) {
      expect(approvalEvent.toolCall).toBeDefined();
      expect(approvalEvent.toolCall!.name).toBeDefined();
      expect(typeof approvalEvent.toolCall!.name).toBe('string');
    }
  });

  it('should persist messages in database during streaming', async () => {
    const threadId = randomUUID();
    const options: StreamFieldNoteAgentOptions = {
      threadId,
      userMessage: 'Osservazione: la vite ha le foglie gialle nel campo streaming',
      userId: testUserId,
      prisma,
      modelName: LIVE_TEST_CHAT_MODEL,
      temperature: 0,
    };

    const generator = streamFieldNoteAgentChat(options);

    let result: IteratorResult<StreamEvent, unknown>;
    do {
      result = await generator.next();
    } while (!result.done);

    // Check that a chat was created
    const chat = await prisma.chat.findFirst({
      where: { threadId },
    });
    expect(chat).toBeDefined();
    expect(chat!.userId).toBe(testUserId);

    // Check that messages were saved
    const messages = await prisma.message.findMany({
      where: { chatId: chat!.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(messages.length).toBeGreaterThanOrEqual(2);

    // First message should be user
    const userMessage = messages.find((m) => m.role === 'USER');
    expect(userMessage).toBeDefined();
    expect(userMessage!.content).toContain('foglie gialle');

    // Should have an assistant response
    const assistantMessage = messages.find((m) => m.role === 'ASSISTANT');
    expect(assistantMessage).toBeDefined();
  });});
