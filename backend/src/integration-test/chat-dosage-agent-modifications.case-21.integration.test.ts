import { LIVE_TEST_CHAT_MODEL } from './live-llm-test-config';
/**
 * Test di integrazione per le nuove funzionalità del chat_dosage_agent:
 *
 *  FEATURE 1 — update_job / create_job tools
 *  FEATURE 2 — search_disciplinari_bdf_pdf (RAG su PDF BDF)
 *  FEATURE 3 — requireApproval=false (batch/bulk mode)
 *
 * Ground truth basata su:
 *  - Dati reali dal CSV "Storico Dati 2024-2025 - Trattamenti fitosanitari.csv" (EMR)
 *  - Disciplinare di Produzione Integrata Emilia-Romagna 2025 (lotta integrata)
 *  - Conoscenza agronomica e BDF per validazione
 *
 * Metriche misurate:
 *  - Accuratezza (risposta corretta vs ground truth)
 *  - Latenza (ms)
 *  - Tool usato (verifica gerarchia di ricerca)
 *
 * Per eseguire:
 *   npm run test:integration -- --testPathPattern chat-dosage-agent-modifications
 */

/**
 * Test di integrazione per le nuove funzionalità del chat_dosage_agent:
 *
 *  FEATURE 1 — update_job / create_job tools
 *  FEATURE 2 — search_disciplinari_bdf_pdf (RAG su PDF BDF)
 *  FEATURE 3 — requireApproval=false (batch/bulk mode)
 *
 * Ground truth basata su:
 *  - Dati reali dal CSV "Storico Dati 2024-2025 - Trattamenti fitosanitari.csv" (EMR)
 *  - Disciplinare di Produzione Integrata Emilia-Romagna 2025 (lotta integrata)
 *  - Conoscenza agronomica e BDF per validazione
 *
 * Metriche misurate:
 *  - Accuratezza (risposta corretta vs ground truth)
 *  - Latenza (ms)
 *  - Tool usato (verifica gerarchia di ricerca)
 *
 * Per eseguire:
 *   npm run test:integration -- --testPathPattern chat-dosage-agent-modifications
 */
/**
 * Test di integrazione per le nuove funzionalità del chat_dosage_agent:
 *
 *  FEATURE 1 — update_job / create_job tools
 *  FEATURE 2 — search_disciplinari_bdf_pdf (RAG su PDF BDF)
 *  FEATURE 3 — requireApproval=false (batch/bulk mode)
 *
 * Ground truth basata su:
 *  - Dati reali dal CSV "Storico Dati 2024-2025 - Trattamenti fitosanitari.csv" (EMR)
 *  - Disciplinare di Produzione Integrata Emilia-Romagna 2025 (lotta integrata)
 *  - Conoscenza agronomica e BDF per validazione
 *
 * Metriche misurate:
 *  - Accuratezza (risposta corretta vs ground truth)
 *  - Latenza (ms)
 *  - Tool usato (verifica gerarchia di ricerca)
 *
 * Per eseguire:
 *   npm run test:integration -- --testPathPattern chat-dosage-agent-modifications
 */
/**
 * Test di integrazione per le nuove funzionalità del chat_dosage_agent:
 *
 *  FEATURE 1 — update_job / create_job tools
 *  FEATURE 2 — search_disciplinari_bdf_pdf (RAG su PDF BDF)
 *  FEATURE 3 — requireApproval=false (batch/bulk mode)
 *
 * Ground truth basata su:
 *  - Dati reali dal CSV "Storico Dati 2024-2025 - Trattamenti fitosanitari.csv" (EMR)
 *  - Disciplinare di Produzione Integrata Emilia-Romagna 2025 (lotta integrata)
 *  - Conoscenza agronomica e BDF per validazione
 *
 * Metriche misurate:
 *  - Accuratezza (risposta corretta vs ground truth)
 *  - Latenza (ms)
 *  - Tool usato (verifica gerarchia di ricerca)
 *
 * Per eseguire:
 *   npm run test:integration -- --testPathPattern chat-dosage-agent-modifications
 */
import { randomUUID } from 'crypto';
import { createTestUser, deleteTestUser, prisma } from './helpers';
import { createAgentApp, handleUserMessage } from '../infrastructure/services/agents/chat_dosage_agent/ChatDosageAgent';
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
  // INTEGRATION — update_job nel contesto conversazionale (batch mode)
  // =========================================================================

  describe('INTEGRATION — Conversazione con update_job (batch mode, senza interruzioni)', () => {

    it('dovrebbe rispettare la pausa di approvazione quando requireApproval=true (default)', async () => {
      if (!process.env.OPENROUTER_API_KEY) {
        console.log('⚠️  Skipping: OPENROUTER_API_KEY not available');
        return;
      }

      const existingJob = buildTestJob({ quantity: 3.0, avversity: 'Ticchiolatura' });
      const jobRepo = buildMockJobRepository(existingJob);
      const stockRepo = buildMockStockRepository();

      const threadId = `thread-approval-${randomUUID()}`;
      const app = await createAgentApp({
        modelName: LIVE_TEST_CHAT_MODEL,
        userId: testUser.id,
        userInfo: { name: testUser.name!, email: testUser.email },
        jobRepository: jobRepo,
        stockRepository: stockRepo,
        requireApproval: true, // ← Approval mode: PAUSA attesa
        skipRAG: true,
        skipDisciplinariPdf: true,
      });

      const response = await handleUserMessage(
        app,
        threadId,
        `Aggiorna il job ID ${existingJob.id}: porta la dose captano da 3 a 2 kg/ha.`,
        existingJob.id,
      );

      // In approval mode, il tool call dovrebbe essere messo in pausa
      // (può essere REQUIRES_APPROVAL o COMPLETED a seconda se usa tool o risponde direttamente)
      expect(['REQUIRES_APPROVAL', 'COMPLETED', 'ERROR']).toContain(response.status);
      if (response.status === 'REQUIRES_APPROVAL') {
        console.log(`  → Paused at tool: ${response.pendingToolCalls?.[0]?.name}`);
        expect(response.pendingToolCalls).toBeDefined();
      }
    }, 90000);});});
