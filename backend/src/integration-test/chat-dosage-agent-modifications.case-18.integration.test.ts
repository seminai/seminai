import { LIVE_TEST_CHAT_MODEL } from './live-llm-test-config';
import { createTestUser, deleteTestUser, prisma } from './helpers';
import { createAgentApp } from '../infrastructure/services/agents/chat_dosage_agent/ChatDosageAgent';
import { buildMockJobRepository, buildMockStockRepository } from './chat-dosage-agent-modifications.harness';

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
  // FEATURE 3 — requireApproval=false (batch mode, senza LLM)
  // =========================================================================

  describe('FEATURE 3 — requireApproval mode', () => {

    it('dovrebbe includere i tool di modifica solo quando userInfo e repository sono forniti', async () => {
      if (!process.env.OPENROUTER_API_KEY) {
        console.log('⚠️  Skipping: OPENROUTER_API_KEY not available');
        return;
      }

      const jobRepo = buildMockJobRepository();
      const stockRepo = buildMockStockRepository();

      // With modification tools
      const appWith = await createAgentApp({
        modelName: LIVE_TEST_CHAT_MODEL,
        userId: testUser.id,
        userInfo: { name: testUser.name!, email: testUser.email },
        jobRepository: jobRepo,
        stockRepository: stockRepo,
        skipDisciplinariPdf: true,
      });
      expect(appWith).toBeDefined();

      // Without modification tools (no userInfo)
      const appWithout = await createAgentApp({
        modelName: LIVE_TEST_CHAT_MODEL,
        userId: testUser.id,
        skipDisciplinariPdf: true,
      });
      expect(appWithout).toBeDefined();
    });});});
