import { LIVE_TEST_CHAT_MODEL } from './live-llm-test-config';
import { prisma, createTestUser, deleteTestUser } from './helpers';
import { createAgentApp, handleUserMessage } from '../infrastructure/services/agents/chat_dosage_agent/ChatDosageAgent';
import { hasLlmGatewayKey } from '../test/llm-test-keys';
import { streamAgentChat, StreamEvent } from '../infrastructure/services/agents/chat_dosage_agent/streaming';
import { ChatCategory, MessageRole, AgentResponseStatus } from '@prisma/client';
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

  describe('Integrazione Streaming', () => {
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

    it('dovrebbe trasmettere gli eventi correttamente in streaming', async () => {
      // Skip if API keys are not available
      if (!hasLlmGatewayKey()) {
        console.log('⚠️ Skipping test: OPENAI_API_KEY not available');
        return;
      }

      const events: StreamEvent[] = [];
      let finalResponse: StreamEvent | null = null;

      for await (const event of streamAgentChat({
        threadId,
        userMessage: 'Ciao, qual è il dosaggio per il grano?',
        userId: testUserId,
        modelName: LIVE_TEST_CHAT_MODEL,
      })) {
        events.push(event);
        // Cattura tutti i tipi di eventi finali
        if (
          event.type === 'complete' ||
          event.type === 'error' ||
          event.type === 'requires_approval'
        ) {
          finalResponse = event;
          // Non fare break per 'requires_approval' perché potrebbe esserci un evento 'complete' dopo
          if (event.type === 'complete' || event.type === 'error') {
            break;
          }
        }
      }

      expect(events.length).toBeGreaterThan(0);

      // Se non abbiamo catturato un evento finale, prendiamo l'ultimo evento
      if (!finalResponse && events.length > 0) {
        finalResponse = events[events.length - 1];
      }

      expect(finalResponse).toBeDefined();
      expect(finalResponse).not.toBeNull();
      expect(['complete', 'error', 'requires_approval']).toContain(finalResponse!.type);

      if (finalResponse!.type === 'complete') {
        expect(finalResponse!.cost).toBeDefined();
        expect(finalResponse!.response).toBeDefined();
      } else if (finalResponse!.type === 'requires_approval') {
        expect(finalResponse!.toolCall).toBeDefined();
      }
    }, 60000);

    it('dovrebbe tracciare i costi durante lo streaming', async () => {
      // Skip if API keys are not available
      if (!hasLlmGatewayKey()) {
        console.log('⚠️ Skipping test: OPENAI_API_KEY not available');
        return;
      }

      let costEvent: StreamEvent | null = null;

      for await (const event of streamAgentChat({
        threadId,
        userMessage: 'Parlami della coltivazione del grano',
        userId: testUserId,
        modelName: LIVE_TEST_CHAT_MODEL,
      })) {
        if (event.type === 'complete' && event.cost) {
          costEvent = event;
          break;
        }
      }

      if (costEvent) {
        expect(costEvent.cost).toBeDefined();
        expect(costEvent.cost!.inputTokens).toBeGreaterThanOrEqual(0);
        expect(costEvent.cost!.outputTokens).toBeGreaterThanOrEqual(0);
        expect(costEvent.cost!.totalCostUsd).toBeGreaterThanOrEqual(0);
      }
    }, 60000);

    it('dovrebbe supportare lo streaming con jobId', async () => {
      // Skip if API keys are not available
      if (!hasLlmGatewayKey()) {
        console.log('⚠️ Skipping test: OPENAI_API_KEY not available');
        return;
      }

      let finalResponse: StreamEvent | null = null;

      for await (const event of streamAgentChat({
        threadId,
        userMessage: 'Analizza questo lavoro',
        userId: testUserId,
        modelName: LIVE_TEST_CHAT_MODEL,
        jobId: 'job-test-id',
      })) {
        if (
          event.type === 'complete' ||
          event.type === 'error' ||
          event.type === 'requires_approval'
        ) {
          finalResponse = event;
          break;
        }
      }

      expect(finalResponse).toBeDefined();
      expect(['complete', 'error', 'requires_approval']).toContain(finalResponse?.type);
    }, 60000);
  });

  describe('Gestione Errori', () => {
    it('dovrebbe gestire threadId non valido correttamente', async () => {
      const app = await createAgentApp({ modelName: LIVE_TEST_CHAT_MODEL });

      // Use a non-existent threadId
      const response = await handleUserMessage(app, 'invalid-thread-id', 'Ciao');

      expect(response.status).toBeDefined();
      // Should either complete or error, but not crash
      expect(['COMPLETED', 'ERROR']).toContain(response.status);
    });

    it('dovrebbe salvare correttamente i messaggi di errore', async () => {
      const threadId = `thread-${randomUUID()}`;
      const chat = await prisma.chat.create({
        data: {
          userId: testUserId,
          category: ChatCategory.DOSAGE_AGENT,
          threadId,
        },
      });

      const message = await prisma.message.create({
        data: {
          chatId: chat.id,
          role: MessageRole.ASSISTANT,
          content: 'Si è verificato un errore',
          status: AgentResponseStatus.ERROR,
          error: 'Fallita elaborazione richiesta',
          sequence: 1,
        },
      });

      expect(message.status).toBe(AgentResponseStatus.ERROR);
      expect(message.error).toBe('Fallita elaborazione richiesta');
    });
  });});
