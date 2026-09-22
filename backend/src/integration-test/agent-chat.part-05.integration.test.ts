import { prisma, createTestUser, deleteTestUser } from './helpers';
import { ChatCategory, MessageRole } from '@prisma/client';
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
  });});
