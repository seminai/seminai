import { LIVE_TEST_CHAT_MODEL } from './live-llm-test-config';
import { prisma, createTestUser, deleteTestUser } from './helpers';
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
  });});
