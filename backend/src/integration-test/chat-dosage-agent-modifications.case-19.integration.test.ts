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
import { createAgentApp, handleUserMessage, approveAction } from '../infrastructure/services/agents/chat_dosage_agent/ChatDosageAgent';
import { GROUND_TRUTH_SCENARIOS, AccuracyResult, evaluateAccuracy, printAccuracyReport } from './chat-dosage-agent-modifications.harness';

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
  // ACCURACY BENCHMARK — LLM + strumenti reali (disciplinari database)
  // =========================================================================

  describe('ACCURACY BENCHMARK — Conformità trattamenti EMR (Ground Truth)', () => {
    const results: AccuracyResult[] = [];

    afterAll(() => {
      printAccuracyReport(results);
      // Verifica soglia minima di accuratezza
      const passed = results.filter((r) => r.passed).length;
      if (results.length > 0) {
        const accuracy = passed / results.length;
        console.log(`\n  [BENCHMARK] Accuracy: ${Math.round(accuracy * 100)}%`);
        // Soglia minima: 60% (sarà usata per decidere ottimizzazioni)
        // Non fail il test ma logga il warning
        if (accuracy < 0.6) {
          console.warn(
            `\n  ⚠️  ACCURACY BELOW THRESHOLD (${Math.round(accuracy * 100)}% < 60%)! Consider agent optimization.`,
          );
        }
      }
    });

    for (const gt of GROUND_TRUTH_SCENARIOS) {
      it(`[${gt.scenario}] — ${gt.product} su ${gt.crop} ${gt.doseHa} ${gt.unit}`, async () => {
        if (!process.env.OPENROUTER_API_KEY) {
          console.log(`⚠️  Skipping: OPENROUTER_API_KEY not available`);
          return;
        }

        const threadId = `thread-bench-${randomUUID()}`;
        const app = await createAgentApp({
          modelName: LIVE_TEST_CHAT_MODEL,
          skipRAG: true,
          // NB: PDF BDF non abilitati per velocità del benchmark
          // ma l'agente usa la conoscenza LLM come fallback se il DB è vuoto
          skipDisciplinariPdf: true,
        });

        const query = `Il prodotto ${gt.product} (${gt.adversity}) applicato su ${gt.crop} a una dose di ${gt.doseHa} ${gt.unit} è conforme al disciplinare di produzione integrata della regione ${gt.region}? Verifica dose min/max, numero massimo di interventi e intervallo minimo.`;

        const startTs = Date.now();
        let response = await handleUserMessage(app, threadId, query);
        let toolUsed: string | undefined;

        // Se richiede approvazione, approva automaticamente per il benchmark
        let approvalRounds = 0;
        while (response.status === 'REQUIRES_APPROVAL' && approvalRounds < 3) {
          toolUsed = response.pendingToolCalls?.[0]?.name;
          response = await approveAction(app, threadId);
          approvalRounds++;
        }

        const latencyMs = Date.now() - startTs;
        const message = response.message ?? '';

        const result = evaluateAccuracy(gt, message, latencyMs, toolUsed);
        results.push(result);

        console.log(
          `  → ${result.passed ? '✅' : '❌'} [${latencyMs}ms] Tool: ${toolUsed ?? 'none'} | Response: "${message.substring(0, 120)}..."`,
        );

        // Assertions di base (non falliscono il test ma contribuiscono al report)
        expect(response.status).not.toBe('ERROR');
        expect(message.length).toBeGreaterThan(50);
      }, 90000);
    }
  });});
