import { DisciplinariExtractedData, DisciplinariExtractionResult } from '../../domain/dtos/disciplinari.dto';


export const MIN_USABLE_DISCIPLINARI_CONFIDENCE = 10;


/**
 * Executes promises with controlled concurrency.
 */
export async function pMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}


export function isUsableDisciplinariExtraction(data: DisciplinariExtractedData): boolean {
  const interventionCount = data.defenseTargets.reduce(
    (sum, target) => sum + target.interventions.length,
    0,
  );
  const rulesCount =
    data.rules.generalPrinciples.length +
    data.rules.prohibitions.length +
    data.rules.mandatoryActions.length +
    data.rules.definitions.length;
  const hasMeaningfulContent =
    data.scopeEntities.length > 0 || data.defenseTargets.length > 0 || interventionCount > 0;
  return (
    hasMeaningfulContent &&
    (interventionCount > 0 ||
      rulesCount > 0 ||
      data.extractionConfidence >= MIN_USABLE_DISCIPLINARI_CONFIDENCE)
  );
}


/**
 * Job data for disciplinari extraction queue.
 */
export interface DisciplinariExtractionJobData {
  files: Array<{
    fileName: string;
    pdfBuffer: Buffer | { type: 'Buffer'; data: number[] };
  }>;
  userId: string;
  concurrency?: number;
  forceReExtract?: boolean;
}


/**
 * Result of a disciplinari extraction job.
 */
export interface DisciplinariExtractionJobResult {
  results: ReadonlyArray<DisciplinariExtractionResult>;
  totalProcessed: number;
  totalExtracted: number;
  totalCached: number;
  totalFailed: number;
  cost: {
    inputTokens: number;
    outputTokens: number;
    totalCostUsd: number;
    costWithMarginUsd: number;
  };
}


export const QUEUE_NAME = 'disciplinari-extraction';
