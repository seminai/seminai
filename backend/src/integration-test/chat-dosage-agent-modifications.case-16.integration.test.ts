import { LIVE_TEST_CHAT_MODEL } from './live-llm-test-config';
import { createTestUser, deleteTestUser, prisma } from './helpers';
import { createAgentApp } from '../infrastructure/services/agents/chat_dosage_agent/ChatDosageAgent';

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
    it('dovrebbe creare AgentApp con requireApproval=false senza errori', async () => {
      if (!process.env.OPENROUTER_API_KEY) {
        console.log('⚠️  Skipping: OPENROUTER_API_KEY not available');
        return;
      }

      const app = await createAgentApp({
        modelName: LIVE_TEST_CHAT_MODEL,
        requireApproval: false,
        skipDisciplinariPdf: true,
      });

      expect(app).toBeDefined();
    });});});
