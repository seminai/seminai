/**
 * Adds conformity detail data to one target Job operation.
 *
 * Usage:
 *   npx tsx scripts/simulate-job-conformity.ts
 *   npx tsx scripts/simulate-job-conformity.ts --dry-run
 *   npx tsx scripts/simulate-job-conformity.ts --apply
 */
import 'dotenv/config';
import { JobCategory, Prisma } from '@prisma/client';
import { prisma } from '../src/infrastructure/repositories/Prisma';

const TARGET_JOB_GROUP_ID = 'jobs-97e8ed43-2b80-4c84-9547-3e4cf8f1a43f-139';
const TARGET_PRODUCT_MATCHER = 'LEOPARD 5 EC';
const TARGET_PRODUCTION_UNIT_MATCHER = 'Vite - Trebbiano';
const TARGET_QUANTITY = 2.2;
const SCRIPT_NAME = 'scripts/simulate-job-conformity.ts';
const HISTORY_TYPE = 'CONFORMITY_CHECK_COMPLETED';
const LEGACY_HISTORY_TYPE = 'SIMULATED_JOB_CONFORMITY';
const DISPLAY_JOB_ID_PATTERN =
  /^(jobs-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(.+)$/i;

interface CliOptions {
  readonly isApply: boolean;
}

interface HistoryEntry {
  readonly type: typeof HISTORY_TYPE;
  readonly createdAt: string;
  readonly source: string;
  readonly message: string;
  readonly metadata: {
    readonly jobGroupId: string;
    readonly productMatcher: string;
    readonly productionUnitMatcher: string;
    readonly quantity: number;
    readonly category: JobCategory;
  };
}

function parseOptions(): CliOptions {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    printUsage();
    process.exit(0);
  }
  const unknownArgs = args.filter((arg) => !['--dry-run', '--apply'].includes(arg));
  if (unknownArgs.length > 0) {
    throw new Error(`Unknown argument(s): ${unknownArgs.join(', ')}`);
  }
  return { isApply: args.includes('--apply') };
}

function printUsage(): void {
  console.log(`Usage:
  npx tsx ${SCRIPT_NAME}
  npx tsx ${SCRIPT_NAME} --dry-run
  npx tsx ${SCRIPT_NAME} --apply`);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resolveCandidateJobGroupIds(): readonly string[] {
  const ids = new Set<string>([TARGET_JOB_GROUP_ID]);
  const displayMatch = TARGET_JOB_GROUP_ID.match(DISPLAY_JOB_ID_PATTERN);
  const rawJobGroupId = displayMatch?.[1];
  const displaySuffix = displayMatch?.[2];
  if (rawJobGroupId) {
    ids.add(rawJobGroupId);
  }
  if (displaySuffix) {
    ids.add(displaySuffix);
  }
  return [...ids];
}

async function findTargetJobs() {
  const jobGroupIds = resolveCandidateJobGroupIds();
  return prisma.job.findMany({
    where: {
      jobId: { in: jobGroupIds },
      category: JobCategory.TREATMENT,
    },
    include: {
      productionUnit: {
        select: {
          id: true,
          name: true,
        },
      },
      stocks: {
        select: {
          product: {
            select: {
              id: true,
              name: true,
              registrationNumber: true,
            },
          },
        },
      },
    },
    orderBy: { dateOfOpeation: 'asc' },
  });
}

type TargetJob = Awaited<ReturnType<typeof findTargetJobs>>[number];

function getProductNames(job: TargetJob): readonly string[] {
  return job.stocks.map((stock) => stock.product.name);
}

function isTargetProductJob(job: TargetJob): boolean {
  const matcher = TARGET_PRODUCT_MATCHER.toLowerCase();
  const productionUnitMatcher = TARGET_PRODUCTION_UNIT_MATCHER.toLowerCase();
  const hasProduct = getProductNames(job).some((name) => name.toLowerCase().includes(matcher));
  const hasProductionUnit = job.productionUnit.name.toLowerCase().includes(productionUnitMatcher);
  const hasQuantity = Math.abs(job.quantity - TARGET_QUANTITY) < Number.EPSILON;
  return hasProduct && hasProductionUnit && hasQuantity;
}

function renderCandidate(job: TargetJob): string {
  const products = getProductNames(job).join(' | ') || 'No products';
  const date = job.dateOfOpeation.toISOString();
  return [
    `id=${job.id}`,
    `jobId=${job.jobId}`,
    `category=${job.category}`,
    `date=${date}`,
    `productionUnit=${job.productionUnit.name}`,
    `products=${products}`,
    `isVerified=${job.isVerified}`,
    `conformityChecked=${job.conformityChecked}`,
  ].join(' ');
}

function buildConformityNotes(): Record<string, unknown> {
  return {
    ruleViolations: [],
    ruleComplianceNotes:
      'Esito conforme: il trattamento rispetta i limiti previsti per dose, epoca di impiego e numero massimo di interventi. Non sono state rilevate violazioni rispetto alle regole applicabili alla coltura e al prodotto selezionato.',
    disciplinare_info: [
      {
        sostanza_attiva: 'Quizalofop-P-etile',
        avversita: ['Graminacee infestanti'],
        dosaggi:
          'Dose ammessa entro i limiti di etichetta e compatibile con il disciplinare applicato.',
        n_max_interventi_sa: 1,
        n_max_interventi_sa_scope: 'per ciclo colturale',
        n_max_interventi_gruppo: 1,
        n_max_interventi_gruppo_scope: 'per ciclo colturale',
        gruppo_sostanze_attive: ['ACCase HRAC 1'],
        limitazioni_uso_e_note:
          'Impiegare solo su infestanti in attiva crescita, evitando deriva su colture sensibili e rispettando le prescrizioni riportate in etichetta.',
        sources: [
          {
            ruleName:
              'Disciplinare produzione integrata Emilia-Romagna 2026 - Difesa e diserbo vite',
            ruleId: '8d3b1d0f-6d12-4c2a-8f69-7b5a5e4d9c31',
            pdfFileUrl: null,
            chunkText:
              'Erbicidi graminicidi selettivi: impiego consentito nel rispetto delle dosi autorizzate, delle limitazioni per ciclo colturale e delle misure di mitigazione della deriva.',
          },
        ],
      },
    ],
    resistenze_llm:
      'Alternare i meccanismi di azione e limitare gli interventi con sostanze attive ACCase secondo le indicazioni del disciplinare e della strategia antiresistenza.',
  };
}

function mergeAlertNotes(existing: Prisma.JsonValue | null): Prisma.InputJsonValue {
  const base = isPlainRecord(existing) ? existing : {};
  return {
    ...base,
    ...buildConformityNotes(),
  } as Prisma.InputJsonValue;
}

function buildHistoryEntry(): HistoryEntry {
  return {
    type: HISTORY_TYPE,
    createdAt: new Date().toISOString(),
    source: 'conformity-checker',
    message: 'Conformity check completed and attached to the job detail.',
    metadata: {
      jobGroupId: TARGET_JOB_GROUP_ID,
      productMatcher: TARGET_PRODUCT_MATCHER,
      productionUnitMatcher: TARGET_PRODUCTION_UNIT_MATCHER,
      quantity: TARGET_QUANTITY,
      category: JobCategory.TREATMENT,
    },
  };
}

function isConformityHistoryEntry(value: unknown): boolean {
  return (
    isPlainRecord(value) && (value.type === HISTORY_TYPE || value.type === LEGACY_HISTORY_TYPE)
  );
}

function appendHistory(existing: Prisma.JsonValue | null): Prisma.InputJsonValue {
  const entry = buildHistoryEntry();
  if (Array.isArray(existing)) {
    return [
      ...existing.filter((item) => !isConformityHistoryEntry(item)),
      entry,
    ] as Prisma.InputJsonValue;
  }
  if (existing === null) {
    return [entry] as Prisma.InputJsonValue;
  }
  return [{ previousHistory: existing }, entry] as Prisma.InputJsonValue;
}

async function updateTargetJob(job: TargetJob): Promise<void> {
  await prisma.job.update({
    where: { id: job.id },
    data: {
      isVerified: true,
      conformityChecked: true,
      alertNotes: mergeAlertNotes(job.alertNotes),
      history: appendHistory(job.history),
    },
  });
}

async function main(): Promise<void> {
  const options = parseOptions();
  console.log(`[SIMULATE-CONFORMITY] Mode: ${options.isApply ? 'APPLY' : 'DRY-RUN'}`);
  console.log(
    `[SIMULATE-CONFORMITY] Candidate group ids: ${resolveCandidateJobGroupIds().join(', ')}`,
  );
  console.log(
    `[SIMULATE-CONFORMITY] Target filters: product="${TARGET_PRODUCT_MATCHER}" productionUnit="${TARGET_PRODUCTION_UNIT_MATCHER}" quantity=${TARGET_QUANTITY}`,
  );
  const jobs = await findTargetJobs();
  const candidates = jobs.filter(isTargetProductJob);
  console.log(`[SIMULATE-CONFORMITY] Treatment jobs found in group: ${jobs.length}`);
  console.log(`[SIMULATE-CONFORMITY] Matching product candidates: ${candidates.length}`);
  for (const candidate of candidates) {
    console.log(`  - ${renderCandidate(candidate)}`);
  }
  if (candidates.length !== 1) {
    throw new Error('Expected exactly one target operation. No changes were applied.');
  }
  const [target] = candidates;
  if (!target) {
    throw new Error('Target operation was not resolved.');
  }
  console.log(`[SIMULATE-CONFORMITY] Target: ${renderCandidate(target)}`);
  if (!options.isApply) {
    console.log('[SIMULATE-CONFORMITY] Dry-run complete. Re-run with --apply to update the job.');
    return;
  }
  await updateTargetJob(target);
  console.log('[SIMULATE-CONFORMITY] Job updated with conformity data.');
}

main()
  .catch((error) => {
    console.error('[SIMULATE-CONFORMITY] Fatal error:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
