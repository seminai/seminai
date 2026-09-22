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
  // PERFORMANCE — Response time targets
  // =========================================================================

  describe('PERFORMANCE — Latenza risposte agente', () => {

    it('creazione AgentApp (con lazy PDF store) deve completarsi entro 3 secondi', async () => {
      if (!process.env.OPENROUTER_API_KEY) {
        console.log('⚠️  Skipping: OPENROUTER_API_KEY not available');
        return;
      }

      const start = Date.now();
      await createAgentApp({
        modelName: LIVE_TEST_CHAT_MODEL,
        skipRAG: true,
        // NB: skipDisciplinariPdf NON impostato → crea il lazy store
      });
      const latencyMs = Date.now() - start;

      console.log(`  → createAgentApp (lazy PDF) latency: ${latencyMs}ms`);
      // Il lazy store non fa download, quindi deve essere veloce
      expect(latencyMs).toBeLessThan(3_000);
    }, 10000);});});
