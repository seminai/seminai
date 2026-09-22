/**
 * Per-chat advisory lock for computing the next message sequence without races.
 *
 * The Message schema does NOT have a unique constraint on (chatId, sequence),
 * so a naive read-then-write of `max(sequence) + 1` can produce duplicates
 * under concurrent writes (e.g. the BullMQ extraction worker finishing while
 * the agent stream is also writing to the same chat). Duplicate sequences do
 * not throw, but they make the FE ordering non-deterministic.
 *
 * This helper serializes writes per-chat using `pg_advisory_xact_lock`,
 * which is released automatically when the surrounding transaction ends.
 * It is safe to call from concurrent processes — they will block on the
 * same key until the holder commits.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../repositories/Prisma';

/** Reserve a stable lock-class id so we don't collide with other features. */
const ADVISORY_LOCK_CLASS_CHAT_SEQUENCE = 4711;

interface LockedSequenceContext {
  readonly tx: Prisma.TransactionClient;
  readonly nextSequence: number;
}

/**
 * Runs `fn` inside a transaction holding a per-chat advisory lock, after
 * computing the next available `sequence` for that chat. Use the provided
 * `tx` client to perform the actual `message.create({...})` so it commits
 * atomically with the sequence read.
 */
export async function withChatSequenceLock<T>(
  chatId: string,
  fn: (ctx: LockedSequenceContext) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // hashtextextended returns a bigint; cast to int4 to match the
    // 2-argument advisory-lock signature (classId int4, objId int4).
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_CLASS_CHAT_SEQUENCE}::int4, ('x' || substr(md5(${chatId}), 1, 8))::bit(32)::int4)`,
    );
    const last = await tx.message.findFirst({
      where: { chatId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    const nextSequence = (last?.sequence ?? 0) + 1;
    return fn({ tx, nextSequence });
  });
}
