import type { ExtractionConfirmerContext } from './extraction-confirmer.context';

export function extractionConfirmerResolveSeasonYear(this: ExtractionConfirmerContext, value: unknown): number {
    const date = this.resolvePuDate(value);
    return date.getUTCFullYear();
  }
