/**
 * Cleanup BullMQ jobs whose `userId` no longer exists in the `User` table.
 *
 * Iterates every configured queue, reads each job (decompressing payload when
 * needed) and removes the job from Redis when the referenced user is gone.
 *
 * Usage:
 *   npx tsx scripts/cleanup/cleanupOrphanJobsRedis.ts
 *   npx tsx scripts/cleanup/cleanupOrphanJobsRedis.ts --dry-run
 */
import 'dotenv/config';
import { Queue } from 'bullmq';
import {
  getRedisConnection,
  closeRedisConnection,
} from '../../src/infrastructure/queue/redis.connection';
import { prisma } from '../../src/infrastructure/repositories/Prisma';
import {
  decompressIfNeeded,
  CompressedData,
} from '../../src/infrastructure/utils/redis-compression.util';

const QUEUE_NAMES = [
  'chat-extraction',
  'conformity-checker',
  'disciplinari-extraction',
  'dosage-agent',
  'fertilizer-label-extraction',
  'field-extraction',
  'file-expiry-checker',
  'label-extraction',
  'onboarding-extraction',
  'outer-loop-processor',
  'product-job-creation',
  'product-label-matching',
  'rule-pdf-vectorization',
] as const;

const JOB_STATES = ['waiting', 'delayed', 'active', 'paused', 'failed'] as const;

interface CleanupReport {
  readonly queueName: string;
  readonly inspected: number;
  readonly removed: number;
  readonly kept: number;
  readonly unreadable: number;
}

function extractUserId(rawData: unknown): string | null {
  if (!rawData || typeof rawData !== 'object') return null;
  const candidate = rawData as CompressedData<unknown> & { userId?: string };
  try {
    if (
      'compressed' in candidate &&
      typeof candidate.compressed === 'boolean' &&
      'data' in candidate
    ) {
      const decoded = decompressIfNeeded(candidate) as { userId?: string };
      return typeof decoded?.userId === 'string' ? decoded.userId : null;
    }
  } catch {
    return null;
  }
  if (typeof candidate.userId === 'string') return candidate.userId;
  return null;
}

async function fetchExistingUserIds(userIds: readonly string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const unique = Array.from(new Set(userIds));
  const rows = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}

async function cleanupQueue(queueName: string, dryRun: boolean): Promise<CleanupReport> {
  const connection = getRedisConnection();
  const queue = new Queue(queueName, { connection });
  try {
    const jobs = await queue.getJobs([...JOB_STATES]);
    const userIds: string[] = [];
    const jobUserIds = new Map<string, string | null>();
    let unreadable = 0;
    for (const job of jobs) {
      const userId = extractUserId(job.data);
      jobUserIds.set(job.id ?? '', userId);
      if (userId === null) {
        unreadable += 1;
      } else {
        userIds.push(userId);
      }
    }
    const existing = await fetchExistingUserIds(userIds);
    let removed = 0;
    let kept = 0;
    for (const job of jobs) {
      const userId = jobUserIds.get(job.id ?? '');
      if (!userId) {
        kept += 1;
        continue;
      }
      if (existing.has(userId)) {
        kept += 1;
        continue;
      }
      console.log(`[CLEANUP-REDIS] ${queueName} job=${job.id} user=${userId} → orphan`);
      if (!dryRun) {
        try {
          await job.remove();
        } catch (error) {
          console.warn(
            `[CLEANUP-REDIS] Failed to remove job ${job.id} from ${queueName}:`,
            error instanceof Error ? error.message : error,
          );
          kept += 1;
          continue;
        }
      }
      removed += 1;
    }
    return { queueName, inspected: jobs.length, removed, kept, unreadable };
  } finally {
    await queue.close();
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`[CLEANUP-REDIS] Mode: ${dryRun ? 'DRY-RUN' : 'DESTRUCTIVE'}`);
  const reports: CleanupReport[] = [];
  for (const queueName of QUEUE_NAMES) {
    try {
      const report = await cleanupQueue(queueName, dryRun);
      reports.push(report);
      console.log(
        `[CLEANUP-REDIS] ${queueName}: inspected=${report.inspected} removed=${report.removed} kept=${report.kept} unreadable=${report.unreadable}`,
      );
    } catch (error) {
      console.error(
        `[CLEANUP-REDIS] Failed to process queue ${queueName}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  const totalRemoved = reports.reduce((sum, r) => sum + r.removed, 0);
  const totalKept = reports.reduce((sum, r) => sum + r.kept, 0);
  const totalUnreadable = reports.reduce((sum, r) => sum + r.unreadable, 0);
  console.log(
    `[CLEANUP-REDIS] DONE — removed=${totalRemoved} kept=${totalKept} unreadable=${totalUnreadable}`,
  );
  await prisma.$disconnect();
  closeRedisConnection();
}

main().catch((error) => {
  console.error('[CLEANUP-REDIS] Fatal error:', error);
  process.exit(1);
});
