/**
 * Cleanup orphaned `DosageAgentJob` rows:
 *   1. Delete rows whose `userId` no longer references a valid `User`
 *      (these survive as leftovers when an upsert raced with a user deletion
 *      or when the FK was never valid in the first place).
 *   2. Mark as FAILED any job stuck in ACTIVE state for more than 1 hour
 *      (zombies from crashed workers).
 *
 * Usage:
 *   npx tsx scripts/cleanup/cleanupOrphanDosageAgentJobs.ts
 *   npx tsx scripts/cleanup/cleanupOrphanDosageAgentJobs.ts --dry-run
 */
import 'dotenv/config';
import { prisma } from '../../src/infrastructure/repositories/Prisma';

const ZOMBIE_THRESHOLD_MS = 60 * 60 * 1000;

async function deleteOrphans(dryRun: boolean): Promise<number> {
  const orphans = await prisma.$queryRaw<Array<{ id: string; userId: string }>>`
    SELECT j.id, j."userId"
    FROM "DosageAgentJob" j
    LEFT JOIN "User" u ON u.id = j."userId"
    WHERE u.id IS NULL
  `;
  if (orphans.length === 0) {
    console.log('[CLEANUP-DOSAGE] No orphan DosageAgentJob rows found');
    return 0;
  }
  console.log(`[CLEANUP-DOSAGE] Found ${orphans.length} orphan job(s):`);
  for (const row of orphans) {
    console.log(`  - job=${row.id} userId=${row.userId}`);
  }
  if (dryRun) return orphans.length;
  const ids = orphans.map((o) => o.id);
  const deleted = await prisma.dosageAgentJob.deleteMany({
    where: { id: { in: ids } },
  });
  console.log(`[CLEANUP-DOSAGE] Deleted ${deleted.count} orphan row(s)`);
  return deleted.count;
}

async function failZombies(dryRun: boolean): Promise<number> {
  const threshold = new Date(Date.now() - ZOMBIE_THRESHOLD_MS);
  const zombies = await prisma.dosageAgentJob.findMany({
    where: {
      state: 'ACTIVE',
      updatedAt: { lt: threshold },
    },
    select: { id: true, updatedAt: true, userId: true },
  });
  if (zombies.length === 0) {
    console.log('[CLEANUP-DOSAGE] No ACTIVE zombie jobs older than 1h');
    return 0;
  }
  console.log(`[CLEANUP-DOSAGE] Found ${zombies.length} zombie ACTIVE job(s):`);
  for (const row of zombies) {
    console.log(`  - job=${row.id} user=${row.userId} updatedAt=${row.updatedAt.toISOString()}`);
  }
  if (dryRun) return zombies.length;
  const updated = await prisma.dosageAgentJob.updateMany({
    where: { id: { in: zombies.map((z) => z.id) } },
    data: {
      state: 'FAILED',
      failedReason: 'Marked FAILED by cleanup: stuck in ACTIVE for more than 1 hour',
      finishedOn: new Date(),
    },
  });
  console.log(`[CLEANUP-DOSAGE] Marked ${updated.count} zombie job(s) as FAILED`);
  return updated.count;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`[CLEANUP-DOSAGE] Mode: ${dryRun ? 'DRY-RUN' : 'DESTRUCTIVE'}`);
  try {
    const orphanCount = await deleteOrphans(dryRun);
    const zombieCount = await failZombies(dryRun);
    console.log(
      `[CLEANUP-DOSAGE] DONE — orphans=${orphanCount} zombies=${zombieCount} (dryRun=${dryRun})`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[CLEANUP-DOSAGE] Fatal error:', error);
  process.exit(1);
});
