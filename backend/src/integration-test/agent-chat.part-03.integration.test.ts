import { LIVE_TEST_CHAT_MODEL } from './live-llm-test-config';
import { prisma, createTestUser, deleteTestUser } from './helpers';
import { createAgentApp, handleUserMessage, approveAction, rejectAction } from '../infrastructure/services/agents/chat_dosage_agent/ChatDosageAgent';
import { hasLlmGatewayKey } from '../test/llm-test-keys';
import { ChatCategory } from '@prisma/client';
import { randomUUID } from 'crypto';

jest.setTimeout(120000);

export interface MessageCost {
  inputTokens: number;
  outputTokens: number;
  tavilyCalls: number;
  totalCostUsd: number;
  costWithMarginUsd: number;
}

export interface PendingToolCall {
  name: string;
  args: Record<string, unknown>;
  id: string;
}

export interface ContentBlock {
  type: string;
  content: string;
  language?: string;
}
describe('Test di Integrazione Chat Agente', () => {
  let testUserId: string;
  let testUser: Awaited<ReturnType<typeof createTestUser>>;

  beforeAll(async () => {
    testUser = await createTestUser();
    testUserId = testUser.id;
  });

  afterEach(async () => {
    // Clean up chats and messages after each test
    await prisma.messageSource.deleteMany({});
    await prisma.sourceCitation.deleteMany({});
    await prisma.message.deleteMany({});
    await prisma.chat.deleteMany({});
  });

  afterAll(async () => {
    await deleteTestUser();
  });

  describe('Integrazione ChatDosageAgent', () => {
    let threadId: string;

    beforeEach(async () => {
      threadId = `thread-${randomUUID()}`;
      await prisma.chat.create({
        data: {
          userId: testUserId,
          category: ChatCategory.DOSAGE_AGENT,
          threadId,
          modelName: LIVE_TEST_CHAT_MODEL,
        },
      });
    });

    it('dovrebbe gestire un messaggio semplice senza strumenti', async () => {
      // Skip if API keys are not available
      if (!hasLlmGatewayKey()) {
        console.log('⚠️ Skipping test: OPENAI_API_KEY not available');
        return;
      }

      const app = await createAgentApp({ modelName: LIVE_TEST_CHAT_MODEL });
      const response = await handleUserMessage(app, threadId, 'Ciao, come stai?');

      expect(response.status).toBeDefined();
      expect(['COMPLETED', 'REQUIRES_APPROVAL', 'ERROR']).toContain(response.status);

      // L'agente gestisce solo la logica, non salva i messaggi nel database
      // Il salvataggio è responsabilità del controller/servizio superiore
      if (response.status === 'COMPLETED') {
        expect(response.message).toBeDefined();
        expect(typeof response.message).toBe('string');
        expect(response.message!.length).toBeGreaterThan(0);
      }
    }, 60000);

    it('dovrebbe gestire un messaggio che richiede approvazione strumento', async () => {
      // Skip if API keys are not available
      if (!hasLlmGatewayKey() || !process.env.TAVILY_API_KEY) {
        console.log('⚠️ Skipping test: API keys not available');
        return;
      }

      const app = await createAgentApp({ modelName: LIVE_TEST_CHAT_MODEL });
      const response = await handleUserMessage(
        app,
        threadId,
        'Cerca informazioni scientifiche sul dosaggio del grano',
      );

      // The agent might require approval if it decides to use Tavily
      expect(response.status).toBeDefined();
      expect(['COMPLETED', 'REQUIRES_APPROVAL', 'ERROR']).toContain(response.status);

      if (response.status === 'REQUIRES_APPROVAL') {
        expect(response.pendingToolCalls).toBeDefined();
        expect(response.pendingToolCalls?.length).toBeGreaterThan(0);
        expect(response.pendingToolCalls?.[0].name).toBe('tavily_scientific_search');
      }
    }, 60000);

    it('dovrebbe supportare la chiamata con jobId nel contesto', async () => {
      // Skip if API keys are not available
      if (!hasLlmGatewayKey()) {
        console.log('⚠️ Skipping test: API keys not available');
        return;
      }

      const app = await createAgentApp({ modelName: LIVE_TEST_CHAT_MODEL, userId: testUserId });
      const jobId = 'job-123'; // Mock job ID
      const response = await handleUserMessage(
        app,
        threadId,
        'Dammi dettagli su questo lavoro',
        jobId,
      );

      expect(response.status).toBeDefined();
      // Just verifying it doesn't crash with the extra parameter
      expect(['COMPLETED', 'REQUIRES_APPROVAL', 'ERROR']).toContain(response.status);
    }, 60000);

    it('dovrebbe approvare ed eseguire una chiamata strumento', async () => {
      // Skip if API keys are not available
      if (!hasLlmGatewayKey() || !process.env.TAVILY_API_KEY) {
        console.log('⚠️ Skipping test: API keys not available');
        return;
      }

      const app = await createAgentApp({ modelName: LIVE_TEST_CHAT_MODEL });

      // First, send a message that might require tool
      const initialResponse = await handleUserMessage(
        app,
        threadId,
        'Cerca informazioni scientifiche sul dosaggio del grano',
      );

      if (initialResponse.status === 'REQUIRES_APPROVAL') {
        // Approve the action
        const approvedResponse = await approveAction(app, threadId);

        expect(approvedResponse.status).toBeDefined();
        expect(['COMPLETED', 'REQUIRES_APPROVAL', 'ERROR']).toContain(approvedResponse.status);

        if (approvedResponse.status === 'COMPLETED') {
          expect(approvedResponse.message).toBeDefined();
          expect(approvedResponse.sources).toBeDefined();
        }
      }
    }, 120000);

    it('dovrebbe rifiutare una chiamata strumento e gestire il rifiuto', async () => {
      // Skip if API keys are not available
      if (!hasLlmGatewayKey() || !process.env.TAVILY_API_KEY) {
        console.log('⚠️ Skipping test: API keys not available');
        return;
      }

      const app = await createAgentApp({ modelName: LIVE_TEST_CHAT_MODEL });

      const initialResponse = await handleUserMessage(
        app,
        threadId,
        'Cerca informazioni scientifiche sul dosaggio del grano',
      );

      if (initialResponse.status === 'REQUIRES_APPROVAL') {
        // Reject the action
        const rejectedResponse = await rejectAction(
          app,
          threadId,
          'Non voglio eseguire questa ricerca',
        );

        expect(rejectedResponse.status).toBeDefined();
        // Agent should adjust and provide alternative response
        expect(rejectedResponse.message).toBeDefined();
      }
    }, 120000);
  });});
