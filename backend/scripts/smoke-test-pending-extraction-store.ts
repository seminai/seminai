/**
 * Smoke test for pending-extraction-store (Fase 3).
 * Verifies the Redis round-trip: save → get → updateData → delete.
 *
 * Run: npx tsx scripts/smoke-test-pending-extraction-store.ts
 * Requires a running Redis (default: redis://localhost:6379).
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import {
  savePendingExtraction,
  getPendingExtraction,
  updatePendingExtractionData,
  deletePendingExtraction,
} from '../src/infrastructure/persistence/pending-extraction-store';
import { getRedisConnection } from '../src/infrastructure/queue/redis.connection';

async function main(): Promise<void> {
  const reviewId = randomUUID();
  const now = Date.now();
  const checks: string[] = [];
  let failed = 0;

  function assert(label: string, cond: boolean): void {
    const status = cond ? '✅ PASS' : '❌ FAIL';
    checks.push(`  ${status}  ${label}`);
    if (!cond) failed += 1;
  }

  try {
    await savePendingExtraction({
      reviewId,
      threadId: 'thread-test',
      userId: 'user-test',
      companyId: 'company-test',
      category: 'DDT',
      fileName: 'ddt-test.pdf',
      data: { ddtNumber: '689', supplierName: 'AGRICASTELLO SRL' },
      createdAt: now,
      updatedAt: now,
    });
    assert('savePendingExtraction completes', true);

    const fetched = await getPendingExtraction(reviewId);
    assert('getPendingExtraction returns the record', !!fetched);
    assert('fetched.category === DDT', fetched?.category === 'DDT');
    assert(
      'fetched.data.ddtNumber === 689',
      (fetched?.data as { ddtNumber?: string } | undefined)?.ddtNumber === '689',
    );

    const updated = await updatePendingExtractionData(reviewId, {
      ddtNumber: '690',
      supplierName: 'AGRICASTELLO SRL',
      carrier: 'Vettore X',
    });
    assert('updatePendingExtractionData completes', !!updated);
    assert(
      'updated.data.ddtNumber === 690',
      (updated?.data as { ddtNumber?: string } | undefined)?.ddtNumber === '690',
    );
    assert('updated.updatedAt > createdAt', (updated?.updatedAt ?? 0) >= now);

    const removed = await deletePendingExtraction(reviewId);
    assert('deletePendingExtraction returns true', removed);

    const afterDelete = await getPendingExtraction(reviewId);
    assert('getPendingExtraction returns null after delete', afterDelete === null);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.push(`  ❌ ERROR  ${msg}`);
    failed += 1;
  }

  console.log(checks.join('\n'));
  console.log(
    `\nResults: ${checks.filter((l) => l.includes('PASS')).length} passed, ${failed} failed`,
  );

  await getRedisConnection().quit();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
