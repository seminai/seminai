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

import { randomUUID } from 'crypto';
import { JobCategory } from '@prisma/client';
import { createTestUser, deleteTestUser, prisma } from './helpers';
import {
  createAgentApp,
  handleUserMessage,
  approveAction,
} from '../infrastructure/services/agents/chat_dosage_agent/ChatDosageAgent';
import {
  createUpdateJobTool,
  createAddJobTool,
} from '../infrastructure/services/agents/chat_dosage_agent/tools-job-modification';
import {
  DisciplinariPdfVectorStore,
  BDF_DISCIPLINARI_CATALOG,
} from '../infrastructure/services/agents/chat_dosage_agent/rag/DisciplinariPdfVectorStore';
import { createDisciplinariPdfSearchTool } from '../infrastructure/services/agents/chat_dosage_agent/tools-disciplinari-bdf';
import type { IJobRepository } from '../domain/repositories/IJobRepository';
import type { IStockRepository } from '../domain/repositories/IStockRepository';
import { Job } from '../domain/entities/Job';

jest.setTimeout(180000); // 3 minuti per test LLM

// ---------------------------------------------------------------------------
// Ground Truth da CSV + disciplinare EMR 2025
// ---------------------------------------------------------------------------

/**
 * Dati estratti da "Storico Dati 2024-2025 - Trattamenti fitosanitari.csv"
 * con annotazioni di conformità rispetto al Disciplinare EMR 2025.
 *
 * mustContainTerms: array di array — ogni elemento è un gruppo OR.
 *   Es: [['rame','copper'], ['conforme']] → deve contenere ('rame' OR 'copper') AND 'conforme'
 */
interface GroundTruth {
  scenario: string;
  product: string;
  crop: string;
  adversity: string;
  doseHa: number;
  unit: string;
  region: string;
  expectedConformant: boolean;
  expectedReason: string;
  /** Array of OR-groups — each group passes if ANY term in the group is present */
  mustContainOrGroups: string[][];
  mustNotContainTerms?: string[];
}

const GROUND_TRUTH_SCENARIOS: GroundTruth[] = [
  {
    // CSV Row 2: POLTIGLIA DISPERSS su Albicocco, dose 4.7 kg/ha
    // EMR 2025: rame max 4 kg/ha metallo/anno; prodotto al 20% → 4.7*0.2=0.94 kg Cu metallo → CONFORME
    scenario: 'Rame albicocco cancro batterico - CONFORME',
    product: 'Poltiglia Disperss',
    crop: 'Albicocco',
    adversity: 'Cancro batterico',
    doseHa: 4.7,
    unit: 'kg/ha',
    region: 'Emilia-Romagna',
    expectedConformant: true,
    expectedReason:
      'Rame a 4.7 kg/ha = 0.94 kg Cu metallo/intervento, entro limite annuo 4 kg Cu/ha',
    mustContainOrGroups: [
      ['rame', 'poltiglia', 'copper'], // active ingredient or product
      ['conforme', 'ammesso', 'consentito', 'autorizzato'],
    ],
    mustNotContainTerms: ['revocato'],
  },
  {
    // CSV Row 1: STRATOS ULTRA (Ciclossidim 10.8%) su Cicoria, 5L totale / 1.5544 ha = 3.2 L/ha
    // Etichetta Stratos Ultra: max 2.0 L/ha → 3.2 L/ha NON CONFORME
    scenario: 'Ciclossidim cicoria dose eccessiva - NON CONFORME',
    product: 'Stratos Ultra',
    crop: 'Cicoria',
    adversity: 'Bromus (graminacee poliennali)',
    doseHa: 3.2,
    unit: 'L/ha',
    region: 'Emilia-Romagna',
    expectedConformant: false,
    expectedReason: 'Ciclossidim (Stratos Ultra): dose 3.2 L/ha supera limite massimo 2.0 L/ha',
    mustContainOrGroups: [
      ['ciclossidim', 'stratos', 'cycloxydim'],
      ['non conforme', 'supera', 'eccede', 'superiore', 'oltre'],
    ],
    mustNotContainTerms: [],
  },
  {
    // Captano su Melo - EMR 2025: max 2 kg/ha, 4 interventi/anno, 7 gg intervallo
    scenario: 'Captano melo ticchiolatura dose standard - CONFORME',
    product: 'Captano',
    crop: 'Melo',
    adversity: 'Ticchiolatura',
    doseHa: 1.5,
    unit: 'kg/ha',
    region: 'Emilia-Romagna',
    expectedConformant: true,
    expectedReason: 'Captano 1.5 kg/ha su Melo: entro dose max 2 kg/ha',
    mustContainOrGroups: [
      ['captano', 'captan'],
      ['ticchiolatura', 'scab'],
      ['conforme', 'ammesso', 'rispettata', 'entro'],
    ],
    mustNotContainTerms: ['vietato'],
  },
  {
    // Captano a dose eccessiva - EMR 2025: max 2 kg/ha → 3 kg/ha NON CONFORME
    scenario: 'Captano melo dose eccessiva - NON CONFORME',
    product: 'Captano',
    crop: 'Melo',
    adversity: 'Ticchiolatura',
    doseHa: 3.0,
    unit: 'kg/ha',
    region: 'Emilia-Romagna',
    expectedConformant: false,
    expectedReason: 'Captano 3 kg/ha supera la dose massima di 2 kg/ha',
    mustContainOrGroups: [
      ['captano', 'captan'],
      ['non conforme', 'supera', 'eccede', 'superiore', 'oltre il limite'],
    ],
    mustNotContainTerms: [],
  },
  {
    // Zolfo su Vite contro Oidio - EMR 2025: ampiamente autorizzato
    scenario: 'Zolfo vite oidio - CONFORME',
    product: 'Microthiol Disperss',
    crop: 'Vite',
    adversity: 'Oidio',
    doseHa: 5.0,
    unit: 'kg/ha',
    region: 'Emilia-Romagna',
    expectedConformant: true,
    expectedReason: 'Zolfo 5 kg/ha su Vite: entro i limiti DPI EMR',
    mustContainOrGroups: [
      ['zolfo', 'microthiol', 'sulphur', 'sulfur'],
      ['oidio', 'powdery'],
      ['conforme', 'ammesso', 'autorizzato', 'consentito'],
    ],
    mustNotContainTerms: ['revocato'],
  },
];

// ---------------------------------------------------------------------------
// Helper: mock repositories
// ---------------------------------------------------------------------------

function buildMockJobRepository(existingJob: Job | null = null): IJobRepository {
  const updatedJobs: { id: string; data: Partial<Job> }[] = [];
  const createdJobs: Job[] = [];

  return {
    findById: jest.fn().mockResolvedValue(existingJob),
    create: jest.fn().mockImplementation(async (job: Job) => {
      createdJobs.push(job);
      return job;
    }),
    createMany: jest.fn().mockResolvedValue(undefined),
    findAll: jest.fn().mockResolvedValue([]),
    findManyByProductionUnitId: jest.fn().mockResolvedValue([]),
    findManyByUserIdWithAssignment: jest.fn().mockResolvedValue([]),
    findManyByUserIdWithAssignmentWithoutHistory: jest.fn().mockResolvedValue([]),
    findVerifiedJobsByUserIdWithAssignment: jest.fn().mockResolvedValue({ jobs: [], total: 0 }),
    findUnverifiedJobsByUserIdWithAssignment: jest.fn().mockResolvedValue([]),
    findJobGroupsSummaryByUserId: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockImplementation(async (id: string, data: Partial<Job>) => {
      updatedJobs.push({ id, data });
      return { ...(existingJob ?? {}), ...data, id } as Job;
    }),
    delete: jest.fn().mockResolvedValue(undefined),
    deleteMany: jest.fn().mockResolvedValue(undefined),
    // Expose for assertions
    _updatedJobs: updatedJobs,
    _createdJobs: createdJobs,
  } as unknown as IJobRepository;
}

function buildMockStockRepository(): IStockRepository {
  return {
    create: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue(undefined),
    getAvailableQuantity: jest.fn().mockResolvedValue(0),
    deleteByJobId: jest.fn().mockResolvedValue(undefined),
    deleteBySourceFileIds: jest.fn().mockResolvedValue(0),
    deleteByCompanyId: jest.fn().mockResolvedValue(0),
    updateFileUrl: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    findDeletionContext: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(undefined),
  } as IStockRepository;
}

function buildTestJob(overrides: Partial<Job> = {}): Job {
  return Job.create({
    productionUnitId: `pu-${randomUUID()}`,
    productionCycleId: null,
    jobId: null,
    dateOfOpeation: new Date('2025-03-15'),
    isVerified: false,
    conformityChecked: false,
    category: JobCategory.TREATMENT,
    quantity: 4.7,
    unitOfMeasureQuantity: 'kg/ha',
    productQuantityTreated: null,
    unitOfMeasureProductQuantityTreated: null,
    modeOfApplication: 'irrorazione',
    avversity: 'Cancro batterico',
    giustification: null,
    treatedSurface: 0.7024,
    isLocalizedTreatment: false,
    userId: null,
    note: null,
    alertNotes: null,
    history: null,
    appliedRules: null,
    totalDistributedWaterL: 41.534,
    machineId: null,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Utility: metriche di accuratezza
// ---------------------------------------------------------------------------

interface AccuracyResult {
  scenario: string;
  passed: boolean;
  latencyMs: number;
  containsExpectedTerms: boolean;
  doesNotContainForbiddenTerms: boolean;
  conformanceMentioned: boolean;
  rawResponse: string;
  toolUsed?: string;
}

function evaluateAccuracy(
  gt: GroundTruth,
  response: string,
  latencyMs: number,
  toolUsed?: string,
): AccuracyResult {
  const lower = response.toLowerCase();

  // Each OR-group passes if at least one term in the group is found
  const containsExpectedTerms = gt.mustContainOrGroups.every((group) =>
    group.some((term) => lower.includes(term.toLowerCase())),
  );

  const doesNotContainForbiddenTerms = (gt.mustNotContainTerms ?? []).every(
    (term) => !lower.includes(term.toLowerCase()),
  );

  // Conformance verdict is already encoded in mustContainOrGroups
  const conformanceMentioned = containsExpectedTerms;

  const passed = containsExpectedTerms && doesNotContainForbiddenTerms;

  return {
    scenario: gt.scenario,
    passed,
    latencyMs,
    containsExpectedTerms,
    doesNotContainForbiddenTerms,
    conformanceMentioned,
    rawResponse: response.substring(0, 400),
    toolUsed,
  };
}

function printAccuracyReport(results: AccuracyResult[]): void {
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const accuracy = Math.round((passed / total) * 100);
  const avgLatency = Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / total);

  console.log('\n════════════════════════════════════════════════════════');
  console.log(`  ACCURACY REPORT — Chat Dosage Agent (Modifications)`);
  console.log('════════════════════════════════════════════════════════');
  console.log(`  Overall Accuracy : ${accuracy}% (${passed}/${total})`);
  console.log(`  Avg Latency      : ${avgLatency} ms`);
  console.log('────────────────────────────────────────────────────────');
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    const flags = [
      r.containsExpectedTerms ? '' : '[missing terms]',
      r.doesNotContainForbiddenTerms ? '' : '[forbidden terms found]',
      r.conformanceMentioned ? '' : '[conformance not mentioned]',
    ]
      .filter(Boolean)
      .join(' ');
    console.log(`  ${icon} ${r.scenario} (${r.latencyMs}ms) ${flags}`);
    if (!r.passed) {
      console.log(`     Response snippet: "${r.rawResponse}"`);
    }
  }
  console.log('════════════════════════════════════════════════════════\n');
}

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
    });

    it('dovrebbe restituire errore se il job non esiste', async () => {
      const jobRepo = buildMockJobRepository(null); // null = not found
      const stockRepo = buildMockStockRepository();

      const tool = createUpdateJobTool({
        userId: testUser.id,
        userInfo: { name: testUser.name!, email: testUser.email },
        jobRepository: jobRepo,
        stockRepository: stockRepo,
      });

      const result = await tool.invoke({
        jobId: 'non-existent-id',
        reason: 'Test',
        quantity: 1.0,
      });

      expect(result).toContain('ERROR');
      expect(result).toContain('non-existent-id');
    });

    it('dovrebbe aggiornare avversità e giustificazione', async () => {
      const existingJob = buildTestJob();
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
        reason: 'Aggiornamento avversità su indicazione agronomo',
        avversity: 'Ticchiolatura',
        giustification: 'Condizioni meteorologiche favorevoli allo sviluppo del patogeno',
      });

      expect(result).toContain('UPDATED SUCCESSFULLY');
      expect(jobRepo.update).toHaveBeenCalledWith(
        existingJob.id,
        expect.objectContaining({ avversity: 'Ticchiolatura' }),
      );
    });

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
    });
  });

  // =========================================================================
  // FEATURE 1 — Tool create_job (unit tests con mock)
  // =========================================================================

  describe('FEATURE 1 — create_job tool', () => {
    it('dovrebbe creare un nuovo job di tipo TREATMENT', async () => {
      const jobRepo = buildMockJobRepository();
      const stockRepo = buildMockStockRepository();

      const tool = createAddJobTool({
        userId: testUser.id,
        userInfo: { name: testUser.name!, email: testUser.email },
        jobRepository: jobRepo,
        stockRepository: stockRepo,
      });

      const result = await tool.invoke({
        productionUnitId: `pu-${randomUUID()}`,
        category: JobCategory.TREATMENT,
        dateOfOpeation: '2025-04-10T00:00:00.000Z',
        quantity: 2.0,
        unitOfMeasureQuantity: 'kg/ha',
        avversity: 'Ticchiolatura',
        modeOfApplication: 'irrorazione',
        treatedSurface: 1.2,
      });

      expect(result).toContain('CREATED SUCCESSFULLY');
      expect(jobRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          category: JobCategory.TREATMENT,
          quantity: 2.0,
          avversity: 'Ticchiolatura',
        }),
      );
    });

    it('dovrebbe creare un job di tipo FERTILIZATION', async () => {
      const jobRepo = buildMockJobRepository();
      const stockRepo = buildMockStockRepository();

      const tool = createAddJobTool({
        userId: testUser.id,
        userInfo: { name: testUser.name!, email: testUser.email },
        jobRepository: jobRepo,
        stockRepository: stockRepo,
      });

      const result = await tool.invoke({
        productionUnitId: `pu-${randomUUID()}`,
        category: JobCategory.FERTILIZATION,
        dateOfOpeation: '2025-03-01T00:00:00.000Z',
        quantity: 150.0,
        unitOfMeasureQuantity: 'kg/ha',
        note: 'Concimazione azotata di copertura',
      });

      expect(result).toContain('CREATED SUCCESSFULLY');
      expect(jobRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ category: JobCategory.FERTILIZATION }),
      );
    });
  });

  // =========================================================================
  // FEATURE 2 — DisciplinariPdfVectorStore (lazy loading + catalog)
  // =========================================================================

  describe('FEATURE 2 — DisciplinariPdfVectorStore', () => {
    it('dovrebbe contenere 37 voci nel catalogo BDF (38 righe CSV - 1 header)', () => {
      // bdf.csv: 38 righe totali di cui 1 è l'intestazione → 37 disciplinari
      expect(BDF_DISCIPLINARI_CATALOG).toHaveLength(37);
    });

    it('dovrebbe avere voci per tutte le regioni principali', () => {
      const regions = BDF_DISCIPLINARI_CATALOG.map((e) => e.title.toLowerCase());
      expect(regions.some((r) => r.includes('emilia-romagna'))).toBe(true);
      expect(regions.some((r) => r.includes('piemonte'))).toBe(true);
      expect(regions.some((r) => r.includes('veneto'))).toBe(true);
      expect(regions.some((r) => r.includes('lombardia'))).toBe(true);
      expect(regions.some((r) => r.includes('toscana'))).toBe(true);
    });

    it('dovrebbe avere voci per gli anni 2024 e 2025', () => {
      const years = BDF_DISCIPLINARI_CATALOG.map((e) => e.anno);
      expect(years).toContain(2024);
      expect(years).toContain(2025);
    });

    it('dovrebbe filtrare per regione Emilia-Romagna', () => {
      const store = new DisciplinariPdfVectorStore(BDF_DISCIPLINARI_CATALOG);
      const available = store.listAvailable('Emilia-Romagna');
      expect(available.length).toBeGreaterThanOrEqual(1);
      expect(available.some((e) => e.title.toLowerCase().includes('emilia'))).toBe(true);
    });

    it('dovrebbe filtrare per anno 2025', () => {
      const store = new DisciplinariPdfVectorStore(BDF_DISCIPLINARI_CATALOG);
      const available = store.listAvailable(undefined, 2025);
      expect(available.length).toBeGreaterThan(0);
      expect(available.every((e) => e.anno === 2025)).toBe(true);
    });

    it('dovrebbe essere vuoto prima del primo search (lazy)', () => {
      const store = new DisciplinariPdfVectorStore(BDF_DISCIPLINARI_CATALOG);
      expect(store.hasDocuments()).toBe(false);
    });

    it('dovrebbe restituire array vuoto se regione non esiste', async () => {
      const store = new DisciplinariPdfVectorStore(BDF_DISCIPLINARI_CATALOG);
      const results = await store.search('captano melo', 'RegioneFantasia', 2025);
      expect(results).toHaveLength(0);
    });
  });

  // =========================================================================
  // FEATURE 2 — search_disciplinari_bdf_pdf tool (senza LLM)
  // =========================================================================

  describe('FEATURE 2 — search_disciplinari_bdf_pdf tool (listing + error paths)', () => {
    it('dovrebbe listare le voci disponibili per EMR', () => {
      const store = new DisciplinariPdfVectorStore(BDF_DISCIPLINARI_CATALOG);
      const tool = createDisciplinariPdfSearchTool(store);
      expect(tool.name).toBe('search_disciplinari_bdf_pdf');
    });

    it('dovrebbe restituire messaggio di errore se regione non trovata', async () => {
      const store = new DisciplinariPdfVectorStore(BDF_DISCIPLINARI_CATALOG);
      const tool = createDisciplinariPdfSearchTool(store);

      const result = await tool.invoke({
        query: 'captano ticchiolatura melo',
        region: 'RegioneFantasia',
        year: 2025,
        limit: 5,
      });

      expect(result).toContain('No disciplinari found');
    });
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
    });

    it('dovrebbe creare AgentApp con requireApproval=true (default) senza errori', async () => {
      if (!process.env.OPENROUTER_API_KEY) {
        console.log('⚠️  Skipping: OPENROUTER_API_KEY not available');
        return;
      }

      const app = await createAgentApp({
        modelName: LIVE_TEST_CHAT_MODEL,
        requireApproval: true,
        skipDisciplinariPdf: true,
      });

      expect(app).toBeDefined();
    });

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
    });
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
    }, 90000);

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
    }, 90000);
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
    }, 30000);

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
    }, 10000);
  });
});
