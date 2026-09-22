import { randomUUID } from 'node:crypto';

export interface DosageResultUnit {
  unitProductionId?: string;
  products?: Array<{ trattamenti?: unknown[] }>;
}

export interface UnitSummary {
  unitId: string;
  jobCount: number;
}

export interface ExecutablePlanStep {
  treatment: {
    productName?: string;
  };
}

export function createChatArchiveGroupId(threadId: string): string {
  const compactTimestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  return `chat-${threadId.slice(0, 8)}-${compactTimestamp}-${randomUUID().slice(0, 8)}`;
}

export function buildArchiveGroupName(
  stepsToExecute: ReadonlyArray<ExecutablePlanStep>,
  unitCount: number,
  now: Date,
): string {
  const products = [
    ...new Set(
      stepsToExecute
        .map((step) => step.treatment.productName?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  const productLabel =
    products.length > 0
      ? `${products.slice(0, 3).join(', ')}${products.length > 3 ? ` +${products.length - 3}` : ''}`
      : 'trattamenti';
  const dateLabel = new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now);

  return `Piano chat ${dateLabel} - ${productLabel} - ${unitCount} unita`;
}

/**
 * Filters dosageResults to only include treatments matching the given step sequences.
 *
 * The sequence numbers are assigned the same way as in generate-plan.tool.ts buildSteps():
 * iterate units → products → treatments, incrementing sequence for each treatment.
 * This function deep-clones the relevant portions so the original WM data is untouched.
 */
export function filterDosageResultsByStepSequences(
  dosageResults: DosageResultUnit[],
  stepSequences: number[],
): DosageResultUnit[] {
  const selectedSet = new Set(stepSequences);
  const filtered: DosageResultUnit[] = [];
  let sequence = 1;

  for (const unit of dosageResults) {
    const products = unit.products ?? [];
    const filteredProducts: Array<{ trattamenti?: unknown[] }> = [];

    for (const product of products) {
      const treatments = product.trattamenti ?? [];
      const filteredTreatments: unknown[] = [];

      for (const treatment of treatments) {
        if (selectedSet.has(sequence)) {
          filteredTreatments.push(treatment);
        }
        sequence++;
      }

      if (filteredTreatments.length > 0) {
        filteredProducts.push({ ...product, trattamenti: filteredTreatments });
      }
    }

    if (filteredProducts.length > 0) {
      filtered.push({ ...unit, products: filteredProducts });
    }
  }

  return filtered;
}
