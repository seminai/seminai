import { Job } from '../domain/entities/Job';
import type { IJobRepository } from '../domain/repositories/IJobRepository';
import type { IStockRepository } from '../domain/repositories/IStockRepository';
import { randomUUID } from 'crypto';
import { JobCategory } from '@prisma/client';

// 3 minuti per test LLM

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
export interface GroundTruth {
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

export const GROUND_TRUTH_SCENARIOS: GroundTruth[] = [
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

export function buildMockJobRepository(existingJob: Job | null = null): IJobRepository {
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

export function buildMockStockRepository(): IStockRepository {
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

export function buildTestJob(overrides: Partial<Job> = {}): Job {
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

export interface AccuracyResult {
  scenario: string;
  passed: boolean;
  latencyMs: number;
  containsExpectedTerms: boolean;
  doesNotContainForbiddenTerms: boolean;
  conformanceMentioned: boolean;
  rawResponse: string;
  toolUsed?: string;
}

export function evaluateAccuracy(
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
