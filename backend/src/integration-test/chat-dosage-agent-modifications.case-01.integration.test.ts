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
    it('dovrebbe aggiornare la quantità di un job esistente e tracciare la history', async () => {
      const existingJob = buildTestJob({ quantity: 4.7, unitOfMeasureQuantity: 'kg/ha' });
      const jobRepo = buildMockJobRepository(existingJob);
      const stockRepo = buildMockStockRepository();

      const tool = createUpdateJobTool({
        userId: testUser.id,
        userInfo: { name: testUser.name!, email: testUser.email },
        jobRepository: jobRepo,
        stockRepository: stockRepo,
      });

      const result = await tool.invoke({
        jobId: existingJob.id,
        reason: 'Correzione dose: disciplinare EMR 2025 max 2 kg/ha',
        quantity: 2.5,
        unitOfMeasureQuantity: 'kg/ha',
      });

      expect(result).toContain('UPDATED SUCCESSFULLY');
      expect(jobRepo.update).toHaveBeenCalledWith(
        existingJob.id,
        expect.objectContaining({ quantity: 2.5 }),
      );
    });});});
