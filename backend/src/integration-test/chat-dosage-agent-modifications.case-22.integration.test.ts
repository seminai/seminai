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
    it('risposta semplice senza tool deve completarsi entro 10 secondi', async () => {
      if (!process.env.OPENROUTER_API_KEY) {
        console.log('⚠️  Skipping: OPENROUTER_API_KEY not available');
        return;
      }

      const threadId = `thread-perf-${randomUUID()}`;
      const app = await createAgentApp({
        modelName: LIVE_TEST_CHAT_MODEL,
        skipRAG: true,
        skipDisciplinariPdf: true,
      });

      const start = Date.now();
      const response = await handleUserMessage(
        app,
        threadId,
        'Cosa è il rame in apicoltura integrata? Risposta breve.',
      );
      const latencyMs = Date.now() - start;

      console.log(`  → Simple response latency: ${latencyMs}ms`);
      expect(latencyMs).toBeLessThan(10_000);
      expect(response.status).not.toBe('ERROR');
    }, 30000);});});
