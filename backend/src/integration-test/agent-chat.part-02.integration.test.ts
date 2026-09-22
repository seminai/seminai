import { prisma, createTestUser, deleteTestUser } from './helpers';
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
  });});
