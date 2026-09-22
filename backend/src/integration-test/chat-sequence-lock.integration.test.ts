import { createTestUser, createTestChat, deleteTestChat, deleteTestUser, prisma } from './helpers';
import { writeExtractionCompletedMessage } from '../infrastructure/queue/chat-extraction-message-writer';
import { withChatSequenceLock } from '../infrastructure/queue/chat-sequence-lock';

/**
 * Integration test for the per-chat advisory lock that protects against the
 * read-then-write race in nextSequence.
 *
 * Bug (before fix): two concurrent writers reading max(sequence) at the same
 * time would both compute the same next value and create two messages with
 * the same `sequence`. The Message table has no unique constraint, so the
 * duplicates are silently accepted, producing non-deterministic FE ordering.
 *
 * Fix: chat-extraction-message-writer wraps the read+create in
 * `withChatSequenceLock`, which acquires `pg_advisory_xact_lock` keyed on
 * the chatId hash. Concurrent callers block until the holder commits.
 */
jest.setTimeout(60_000);

const CONCURRENCY = 12;

describe('Chat sequence lock — concurrent writers', () => {
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

  beforeEach(async () => {
    await prisma.message.deleteMany({ where: { chatId } });
  });

  describe('Pre-fix behavior (regression guard)', () => {
    it('demonstrates the race: naive read-then-write produces duplicate sequences under concurrency', async () => {
      async function naiveWrite(idx: number): Promise<void> {
        const last = await prisma.message.findFirst({
          where: { chatId },
          orderBy: { sequence: 'desc' },
          select: { sequence: true },
        });
        const seq = (last?.sequence ?? 0) + 1;
        // Tiny await to widen the race window — represents the "compute message
        // body + serialize metadata" step between read and create in practice.
        await new Promise((resolve) => setImmediate(resolve));
        await prisma.message.create({
          data: {
            chatId,
            role: 'ASSISTANT',
            content: `naive #${idx}`,
            sequence: seq,
            status: 'COMPLETED',
          },
        });
      }

      await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => naiveWrite(i)));

      const rows = await prisma.message.findMany({
        where: { chatId },
        orderBy: { sequence: 'asc' },
        select: { sequence: true },
      });
      const distinct = new Set(rows.map((r) => r.sequence));
      // Race observed: distinct < CONCURRENCY (duplicates collapsed).
      expect(distinct.size).toBeLessThan(CONCURRENCY);
    });
  });

  describe('Post-fix behavior', () => {
    it('withChatSequenceLock serializes concurrent writers — all sequences are unique and consecutive', async () => {
      await Promise.all(
        Array.from({ length: CONCURRENCY }, (_, i) =>
          writeExtractionCompletedMessage({
            threadId,
            fileName: `file-${i}.pdf`,
            documentCategory: 'DDT',
            summary: `summary ${i}`,
            formAlreadyPresented: true,
            extractionReviewId: `review-${i}`,
          }),
        ),
      );

      const rows = await prisma.message.findMany({
        where: { chatId },
        orderBy: { sequence: 'asc' },
        select: { sequence: true },
      });
      expect(rows).toHaveLength(CONCURRENCY);
      const sequences = rows.map((r) => r.sequence);
      const distinct = new Set(sequences);
      expect(distinct.size).toBe(CONCURRENCY);
      // Sequences should be a contiguous run starting at 1.
      expect(sequences).toEqual(Array.from({ length: CONCURRENCY }, (_, i) => i + 1));
    });

    it('helper exposes a transactional client and the computed sequence', async () => {
      // Seed one existing message so the next sequence is 2.
      await prisma.message.create({
        data: { chatId, role: 'ASSISTANT', content: 'seed', sequence: 1, status: 'COMPLETED' },
      });

      const result = await withChatSequenceLock(chatId, async ({ tx, nextSequence }) => {
        const created = await tx.message.create({
          data: {
            chatId,
            role: 'ASSISTANT',
            content: 'inside-lock',
            sequence: nextSequence,
            status: 'COMPLETED',
          },
        });
        return { nextSequence, createdId: created.id };
      });

      expect(result.nextSequence).toBe(2);
      const persisted = await prisma.message.findUnique({ where: { id: result.createdId } });
      expect(persisted?.sequence).toBe(2);
    });
  });
});
