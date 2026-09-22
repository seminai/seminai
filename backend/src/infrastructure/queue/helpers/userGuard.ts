import { PrismaClient } from '@prisma/client';

/**
 * Check whether the user referenced by a queue job still exists.
 *
 * Workers must call this before performing any expensive work so that an
 * orphan `userId` (e.g. user deleted after the enqueue) results in a clean
 * skip rather than a runtime failure that trips foreign keys or credit
 * deduction.
 *
 * @returns `true` when the user exists, `false` otherwise. The caller must
 *          short-circuit the job when `false` is returned.
 */
export async function ensureUserOrSkip(
  userId: string | undefined | null,
  prisma: Pick<PrismaClient, 'user'>,
  context: { jobId?: string | number | null; queueName: string },
): Promise<boolean> {
  if (!userId) {
    console.warn(
      `[QUEUE-GUARD] Skipping job ${context.jobId ?? 'unknown'} on ${context.queueName}: missing userId`,
    );
    return false;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) {
    console.warn(
      `[QUEUE-GUARD] Skipping job ${context.jobId ?? 'unknown'} on ${context.queueName}: user ${userId} no longer exists`,
    );
    return false;
  }
  return true;
}

/**
 * Standard payload returned when a worker decides to skip a job because its
 * prerequisites (e.g. the referenced user) are no longer valid. Returning a
 * value keeps the job in the `completed` state so BullMQ will not retry it.
 */
export interface SkippedJobResult {
  readonly skipped: true;
  readonly reason: string;
}

export function skippedJobResult(reason: string): SkippedJobResult {
  return { skipped: true, reason } as const;
}
