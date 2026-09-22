import type { ExtractionConfirmerContext } from './extraction-confirmer.context';

export function extractionConfirmerResolveCycleIndex(this: ExtractionConfirmerContext, value: unknown, index: number): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : index + 1;
  }
