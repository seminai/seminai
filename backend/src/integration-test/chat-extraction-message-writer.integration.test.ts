import { createTestUser, createTestChat, deleteTestChat, deleteTestUser, prisma } from './helpers';
import { writeExtractionCompletedMessage } from '../infrastructure/queue/chat-extraction-message-writer';

/**
 * Integration test for the rehydrate-form fix.
 *
 * Bug (before fix): the auto-present flow persisted the completion message
 * without `extractionReviewId` in metadata. After a chat reload, the FE
 * HistoricalExtractionReviewBubble couldn't find the reviewId and the form
 * never re-rendered, even when the pending was still alive in Redis.
 *
 * Fix: writeExtractionCompletedMessage accepts an optional extractionReviewId
 * and stores it in metadata. The FE keys off message.metadata.extractionReviewId
 * to fetch the pending via GET /agent-chat/pending-extraction/:reviewId.
 */
jest.setTimeout(30_000);

describe('writeExtractionCompletedMessage — extractionReviewId in metadata', () => {
  let userId: string;
  let chatId: string;
  let threadId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    const chat = await createTestChat({ userId });
    chatId = chat.id;
    threadId = chat.threadId;
  });

  afterAll(async () => {
    await deleteTestChat(chatId);
    await deleteTestUser();
    await prisma.$disconnect();
  });

  it('writes extractionReviewId into message.metadata when auto-presented', async () => {
    const reviewId = 'review-abc-123';

    await writeExtractionCompletedMessage({
      threadId,
      fileName: 'fattura.pdf',
      documentCategory: 'FATTURA',
      summary: 'Estratti 5 prodotti da "fattura.pdf"',
      formAlreadyPresented: true,
      extractionReviewId: reviewId,
    });

    const messages = await prisma.message.findMany({
      where: { chatId, role: 'ASSISTANT' },
      orderBy: { sequence: 'desc' },
      take: 1,
    });

    expect(messages).toHaveLength(1);
    const meta = messages[0].metadata as Record<string, unknown> | null;
    expect(meta).not.toBeNull();
    expect(meta?.extractionReviewId).toBe(reviewId);
    expect(meta?.extractionCompleted).toBe(true);
    expect(meta?.documentCategory).toBe('FATTURA');
    expect(meta?.fileName).toBe('fattura.pdf');
  });

  it('omits extractionReviewId from metadata when not auto-presented (agent-driven path)', async () => {
    await writeExtractionCompletedMessage({
      threadId,
      fileName: 'ddt.pdf',
      documentCategory: 'DDT',
      summary: 'Estratti 3 prodotti da "ddt.pdf"',
      formAlreadyPresented: false,
    });

    const messages = await prisma.message.findMany({
      where: { chatId, role: 'ASSISTANT' },
      orderBy: { sequence: 'desc' },
      take: 1,
    });

    expect(messages).toHaveLength(1);
    const meta = messages[0].metadata as Record<string, unknown> | null;
    expect(meta).not.toBeNull();
    expect(meta).not.toHaveProperty('extractionReviewId');
    expect(meta?.extractionCompleted).toBe(true);
  });

  it('assigns strictly increasing sequence numbers across consecutive writes', async () => {
    const before = await prisma.message.findFirst({
      where: { chatId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    const baseline = before?.sequence ?? 0;

    await writeExtractionCompletedMessage({
      threadId,
      fileName: 'a.pdf',
      documentCategory: 'DDT',
      summary: 'a',
      formAlreadyPresented: true,
      extractionReviewId: 'r1',
    });
    await writeExtractionCompletedMessage({
      threadId,
      fileName: 'b.pdf',
      documentCategory: 'DDT',
      summary: 'b',
      formAlreadyPresented: true,
      extractionReviewId: 'r2',
    });

    const latest = await prisma.message.findMany({
      where: { chatId, role: 'ASSISTANT' },
      orderBy: { sequence: 'desc' },
      take: 2,
    });

    expect(latest).toHaveLength(2);
    expect(latest[0].sequence).toBe(baseline + 2);
    expect(latest[1].sequence).toBe(baseline + 1);
  });
});
