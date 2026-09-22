import { createTestUser, deleteTestUser, prisma } from './helpers';
import { createUpdateJobTool } from '../infrastructure/services/agents/chat_dosage_agent/tools-job-modification';
import { buildMockJobRepository, buildMockStockRepository, buildTestJob } from './chat-dosage-agent-modifications.harness';

jest.setTimeout(180000);
// ===========================================================================
// TEST SUITE
// ===========================================================================

describe('Chat Dosage Agent — Nuove Funzionalità (Modifications + BDF PDF + Batch Mode)', () => {
  let testUser: Awaited<ReturnType<typeof createTestUser>>;

  beforeAll(async () => {
    testUser = await createTestUser();
  });

  afterAll(async () => {
    await prisma.messageSource.deleteMany({});
    await prisma.sourceCitation.deleteMany({});
    await prisma.message.deleteMany({});
    await prisma.chat.deleteMany({ where: { userId: testUser.id } });
    await deleteTestUser();
  });

  // =========================================================================
  // FEATURE 1 — Tool update_job (unit tests con mock)
  // =========================================================================

  describe('FEATURE 1 — update_job tool', () => {

    it('dovrebbe preservare il reason nella chiamata UseCase', async () => {
      const existingJob = buildTestJob();
      const jobRepo = buildMockJobRepository(existingJob);
      const stockRepo = buildMockStockRepository();

      const tool = createUpdateJobTool({
        userId: testUser.id,
        userInfo: { name: testUser.name!, email: testUser.email },
        jobRepository: jobRepo,
        stockRepository: stockRepo,
      });

      const reason = 'Disciplinare EMR 2025: dose max captano 2 kg/ha';

      const result = await tool.invoke({
        jobId: existingJob.id,
        reason,
        quantity: 1.5,
      });

      // The reason must appear in the success response
      expect(result).toContain(reason);
    });});});
