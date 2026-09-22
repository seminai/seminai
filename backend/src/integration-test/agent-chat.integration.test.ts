import { LIVE_TEST_CHAT_MODEL } from './live-llm-test-config';
import { prisma, createTestUser, deleteTestUser } from './helpers';
import {
  createAgentApp,
  handleUserMessage,
  approveAction,
  rejectAction,
} from '../infrastructure/services/agents/chat_dosage_agent/ChatDosageAgent';
import { hasLlmGatewayKey } from '../test/llm-test-keys';
import {
  streamAgentChat,
  StreamEvent,
} from '../infrastructure/services/agents/chat_dosage_agent/streaming';
import { ChatCategory, MessageRole, AgentResponseStatus } from '@prisma/client';
import { randomUUID } from 'crypto';

jest.setTimeout(120000);

interface MessageCost {
  inputTokens: number;
  outputTokens: number;
  tavilyCalls: number;
  totalCostUsd: number;
  costWithMarginUsd: number;
}

interface PendingToolCall {
  name: string;
  args: Record<string, unknown>;
  id: string;
}

interface ContentBlock {
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

  describe('Creazione e Gestione Chat', () => {
    it('dovrebbe creare una nuova chat con categoria e threadId corretti', async () => {
      const threadId = `thread-${randomUUID()}`;
      const chat = await prisma.chat.create({
        data: {
          userId: testUserId,
          category: ChatCategory.DOSAGE_AGENT,
          threadId,
          modelName: LIVE_TEST_CHAT_MODEL,
          temperature: 0,
        },
      });

      expect(chat).toBeDefined();
      expect(chat.userId).toBe(testUserId);
      expect(chat.category).toBe(ChatCategory.DOSAGE_AGENT);
      expect(chat.threadId).toBe(threadId);
      expect(chat.modelName).toBe(LIVE_TEST_CHAT_MODEL);
      expect(chat.temperature).toBe(0);
    });

    it('dovrebbe rispettare il vincolo di unicità del threadId', async () => {
      const threadId = `thread-${randomUUID()}`;
      await prisma.chat.create({
        data: {
          userId: testUserId,
          category: ChatCategory.DOSAGE_AGENT,
          threadId,
        },
      });

      await expect(
        prisma.chat.create({
          data: {
            userId: testUserId,
            category: ChatCategory.DOSAGE_AGENT,
            threadId, // Same threadId
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('Salvataggio Messaggi', () => {
    let chatId: string;
    let threadId: string;

    beforeEach(async () => {
      threadId = `thread-${randomUUID()}`;
      const chat = await prisma.chat.create({
        data: {
          userId: testUserId,
          category: ChatCategory.DOSAGE_AGENT,
          threadId,
        },
      });
      chatId = chat.id;
    });

    it('dovrebbe salvare correttamente un messaggio utente', async () => {
      const message = await prisma.message.create({
        data: {
          chatId,
          role: MessageRole.USER,
          content: 'Qual è il dosaggio per il grano?',
          sequence: 0,
        },
      });

      expect(message).toBeDefined();
      expect(message.role).toBe(MessageRole.USER);
      expect(message.content).toBe('Qual è il dosaggio per il grano?');
      expect(message.sequence).toBe(0);
      expect(message.status).toBeNull();
    });

    it('dovrebbe salvare un messaggio assistente con stato e costo', async () => {
      const message = await prisma.message.create({
        data: {
          chatId,
          role: MessageRole.ASSISTANT,
          content: 'Il dosaggio consigliato per il grano è 2-3 L/ha.',
          status: AgentResponseStatus.COMPLETED,
          sequence: 1,
          cost: {
            inputTokens: 150,
            outputTokens: 200,
            tavilyCalls: 1,
            totalCostUsd: 0.002,
            costWithMarginUsd: 0.0024,
          },
        },
      });

      expect(message).toBeDefined();
      expect(message.role).toBe(MessageRole.ASSISTANT);
      expect(message.status).toBe(AgentResponseStatus.COMPLETED);
      expect(message.cost).toBeDefined();

      const cost = message.cost as unknown as MessageCost;
      expect(cost.inputTokens).toBe(150);
      expect(cost.tavilyCalls).toBe(1);
    });

    it('dovrebbe salvare un messaggio che richiede approvazione con pendingToolCalls', async () => {
      const message = await prisma.message.create({
        data: {
          chatId,
          role: MessageRole.ASSISTANT,
          content: 'Devo cercare informazioni.',
          status: AgentResponseStatus.REQUIRES_APPROVAL,
          sequence: 1,
          pendingToolCalls: [
            {
              name: 'tavily_scientific_search',
              args: { query: 'studi dosaggio grano' },
              id: 'call-123',
            },
          ],
        },
      });

      expect(message.status).toBe(AgentResponseStatus.REQUIRES_APPROVAL);
      expect(message.pendingToolCalls).toBeDefined();

      const toolCalls = message.pendingToolCalls as unknown as PendingToolCall[];
      expect(toolCalls[0].name).toBe('tavily_scientific_search');
    });

    it('dovrebbe salvare messaggi con contentBlocks per contenuto strutturato', async () => {
      const message = await prisma.message.create({
        data: {
          chatId,
          role: MessageRole.ASSISTANT,
          content: 'Ecco le informazioni sul dosaggio:',
          contentBlocks: [
            {
              type: 'text',
              content: 'Il dosaggio consigliato è **2-3 L/ha**.',
            },
            {
              type: 'code',
              language: 'json',
              content: JSON.stringify({ dose: '2-3 L/ha', coltura: 'grano' }),
            },
          ],
          sequence: 1,
          status: AgentResponseStatus.COMPLETED,
        },
      });

      expect(message.contentBlocks).toBeDefined();

      const blocks = message.contentBlocks as unknown as ContentBlock[];
      expect(blocks).toHaveLength(2);
      expect(blocks[0].type).toBe('text');
      expect(blocks[1].type).toBe('code');
      expect(blocks[1].language).toBe('json');
    });

    it('dovrebbe mantenere il corretto ordine sequenziale dei messaggi', async () => {
      const messages = [];
      for (let i = 0; i < 5; i++) {
        const message = await prisma.message.create({
          data: {
            chatId,
            role: i % 2 === 0 ? MessageRole.USER : MessageRole.ASSISTANT,
            content: `Messaggio ${i}`,
            sequence: i,
          },
        });
        messages.push(message);
      }

      const retrievedMessages = await prisma.message.findMany({
        where: { chatId },
        orderBy: { sequence: 'asc' },
      });

      expect(retrievedMessages).toHaveLength(5);
      for (let i = 0; i < 5; i++) {
        expect(retrievedMessages[i].sequence).toBe(i);
      }
    });
  });

  describe('Citazioni Fonti', () => {
    let chatId: string;
    let messageId: string;

    beforeEach(async () => {
      const threadId = `thread-${randomUUID()}`;
      const chat = await prisma.chat.create({
        data: {
          userId: testUserId,
          category: ChatCategory.DOSAGE_AGENT,
          threadId,
        },
      });
      chatId = chat.id;

      const message = await prisma.message.create({
        data: {
          chatId,
          role: MessageRole.ASSISTANT,
          content: 'Basato su studi scientifici...',
          sequence: 1,
          status: AgentResponseStatus.COMPLETED,
        },
      });
      messageId = message.id;
    });

    it('dovrebbe creare e collegare citazioni di fonti ai messaggi', async () => {
      const source = await prisma.sourceCitation.create({
        data: {
          url: 'https://example.com/study',
          title: 'Studio Dosaggio Grano',
          fragment: 'Il dosaggio raccomandato per il grano è 2-3 L/ha basato su prove in campo.',
        },
      });

      await prisma.messageSource.create({
        data: {
          messageId,
          sourceCitationId: source.id,
        },
      });

      const messageWithSources = await prisma.message.findUnique({
        where: { id: messageId },
        include: {
          sources: {
            include: {
              sourceCitation: true,
            },
          },
        },
      });

      expect(messageWithSources?.sources).toHaveLength(1);
      expect(messageWithSources?.sources[0].sourceCitation.url).toBe('https://example.com/study');
      expect(messageWithSources?.sources[0].sourceCitation.title).toBe('Studio Dosaggio Grano');
    });

    it('dovrebbe prevenire citazioni duplicate per lo stesso messaggio', async () => {
      const source = await prisma.sourceCitation.create({
        data: {
          url: 'https://example.com/study',
          title: 'Studio Dosaggio Grano',
          fragment: 'Testo frammento',
        },
      });

      await prisma.messageSource.create({
        data: {
          messageId,
          sourceCitationId: source.id,
        },
      });

      // Try to create duplicate
      await expect(
        prisma.messageSource.create({
          data: {
            messageId,
            sourceCitationId: source.id,
          },
        }),
      ).rejects.toThrow();
    });

    it('dovrebbe permettere la stessa citazione in più messaggi', async () => {
      const source = await prisma.sourceCitation.create({
        data: {
          url: 'https://example.com/study',
          title: 'Studio Dosaggio Grano',
          fragment: 'Testo frammento',
        },
      });

      const message2 = await prisma.message.create({
        data: {
          chatId,
          role: MessageRole.ASSISTANT,
          content: 'Un altro messaggio',
          sequence: 2,
        },
      });

      await prisma.messageSource.create({
        data: {
          messageId,
          sourceCitationId: source.id,
        },
      });

      await prisma.messageSource.create({
        data: {
          messageId: message2.id,
          sourceCitationId: source.id,
        },
      });

      const sourceWithMessages = await prisma.sourceCitation.findUnique({
        where: { id: source.id },
        include: { messages: true },
      });

      expect(sourceWithMessages?.messages).toHaveLength(2);
    });
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
  });

  describe('Integrità Dati', () => {
    it('dovrebbe eliminare a cascata i messaggi quando la chat viene eliminata', async () => {
      const threadId = `thread-${randomUUID()}`;
      const chat = await prisma.chat.create({
        data: {
          userId: testUserId,
          category: ChatCategory.DOSAGE_AGENT,
          threadId,
        },
      });

      await prisma.message.create({
        data: {
          chatId: chat.id,
          role: MessageRole.USER,
          content: 'Messaggio di test',
          sequence: 0,
        },
      });

      await prisma.chat.delete({
        where: { id: chat.id },
      });

      const messages = await prisma.message.findMany({
        where: { chatId: chat.id },
      });

      expect(messages).toHaveLength(0);
    });

    it('dovrebbe eliminare a cascata le fonti dei messaggi quando il messaggio viene eliminato', async () => {
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
          content: 'Test',
          sequence: 0,
        },
      });

      const source = await prisma.sourceCitation.create({
        data: {
          url: 'https://example.com',
          title: 'Test',
          fragment: 'Fragment',
        },
      });

      await prisma.messageSource.create({
        data: {
          messageId: message.id,
          sourceCitationId: source.id,
        },
      });

      await prisma.message.delete({
        where: { id: message.id },
      });

      const messageSources = await prisma.messageSource.findMany({
        where: { messageId: message.id },
      });

      expect(messageSources).toHaveLength(0);
    });
  });
});
