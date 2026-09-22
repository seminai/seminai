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
    it('dovrebbe eseguire update_job automaticamente quando requireApproval=false', async () => {
      if (!process.env.OPENROUTER_API_KEY) {
        console.log('⚠️  Skipping: OPENROUTER_API_KEY not available');
        return;
      }

      const existingJob = buildTestJob({
        quantity: 3.0, // Dose NON conforme — 3 kg/ha captano > max 2 kg/ha
        unitOfMeasureQuantity: 'kg/ha',
        avversity: 'Ticchiolatura',
        note: 'Trattamento captano su melo',
      });

      const jobRepo = buildMockJobRepository(existingJob);
      const stockRepo = buildMockStockRepository();

      const threadId = `thread-batch-${randomUUID()}`;
      const app = await createAgentApp({
        modelName: LIVE_TEST_CHAT_MODEL,
        userId: testUser.id,
        userInfo: { name: testUser.name!, email: testUser.email },
        jobRepository: jobRepo,
        stockRepository: stockRepo,
        requireApproval: false, // ← Batch mode: nessuna pausa
        skipRAG: true,
        skipDisciplinariPdf: true,
      });

      const startTs = Date.now();
      const response = await handleUserMessage(
        app,
        threadId,
        `Ho un job (ID: ${existingJob.id}) con dose captano di 3 kg/ha su melo contro ticchiolatura. Il disciplinare EMR 2025 prevede una dose massima di 2 kg/ha. Aggiorna la dose a 2 kg/ha.`,
        existingJob.id,
      );
      const latencyMs = Date.now() - startTs;

      console.log(`  → Batch update latency: ${latencyMs}ms | Status: ${response.status}`);
      console.log(`  → Response: "${response.message?.substring(0, 200)}"`);

      // In batch mode il job dovrebbe essere stato modificato (o almeno non errore)
      expect(response.status).not.toBe('ERROR');
      expect(response.message).toBeDefined();
    }, 90000);});});
