/**
 * Smoke test for CommitExtractionFromChatUseCase (Fase 4).
 * Flow: seed user + company + pending Redis → run use case → assert FileExtraction row.
 *
 * Run: npx tsx scripts/smoke-test-commit-extraction-from-chat.ts
 * Requires running Postgres + Redis.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/infrastructure/repositories/Prisma';
import { getRedisConnection } from '../src/infrastructure/queue/redis.connection';
import { savePendingExtraction } from '../src/infrastructure/persistence/pending-extraction-store';
import { CommitExtractionFromChatUseCase } from '../src/application/use-cases/extraction/CommitExtractionFromChatUseCase';

async function main(): Promise<void> {
  let failed = 0;
  function assert(label: string, ok: boolean): void {
    console.log(`  ${ok ? '✅ PASS' : '❌ FAIL'}  ${label}`);
    if (!ok) failed += 1;
  }

  const userEmail = `smoke-commit-${randomUUID()}@test.local`;
  const user = await prisma.user.create({
    data: { email: userEmail, name: 'Smoke', surname: 'Commit' },
  });
  const company = await prisma.company.create({
    data: {
      name: `Smoke Co ${randomUUID().slice(0, 6)}`,
      vatNumber: `IT${Math.floor(Math.random() * 1e11)
        .toString()
        .padStart(11, '0')}`,
      fiscalCode: Math.random().toString(36).slice(2, 18).toUpperCase().padEnd(16, 'X'),
      companyUsers: { create: { userId: user.id, role: 'ADMIN' } },
    },
  });
  const reviewId = randomUUID();
  const now = Date.now();

  try {
    await savePendingExtraction({
      reviewId,
      threadId: `thread-${randomUUID()}`,
      userId: user.id,
      companyId: company.id,
      category: 'DDT',
      fileName: 'ddt-smoke.pdf',
      fileUrl: 'https://example.test/ddt-smoke.pdf',
      data: {
        ddtNumber: '689',
        ddtDate: '2025-06-30',
        supplierName: 'AGRICASTELLO SRL',
      },
      createdAt: now,
      updatedAt: now,
    });
    assert('seed pending extraction', true);

    const useCase = new CommitExtractionFromChatUseCase();
    const result = await useCase.execute({ reviewId, userId: user.id });
    assert('commit returns extractionId', !!result.extractionId);
    assert('archiveUrl present', !!result.archiveUrl);
    assert('status is PENDING_CONFIRMATION', result.status === 'PENDING_CONFIRMATION');
    assert('documentCategory is DDT', result.documentCategory === 'DDT');

    const row = await prisma.fileExtraction.findUnique({ where: { id: result.extractionId } });
    assert('FileExtraction row created', !!row);
    assert('row.documentCategory === DDT', row?.documentCategory === 'DDT');
    assert('row.category legacy === ddt', row?.category === 'ddt');
    assert('row.companyId matches', row?.companyId === company.id);
    assert('row.fileId populated (File created from fileUrl)', !!row?.fileId);

    const redis = getRedisConnection();
    const stillPending = await redis.get(`pending-extraction:${reviewId}`);
    assert('pending Redis key removed after commit', stillPending === null);

    // Cleanup
    if (row?.fileId) await prisma.file.delete({ where: { id: row.fileId } });
    await prisma.fileExtraction.delete({ where: { id: result.extractionId } });
  } catch (err) {
    failed += 1;
    console.log(`  ❌ ERROR  ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await prisma.userOnCompany.deleteMany({ where: { userId: user.id } });
    await prisma.company.delete({ where: { id: company.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
    await getRedisConnection().quit();
  }

  console.log(`\nResult: ${failed === 0 ? 'OK' : `${failed} failed`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
