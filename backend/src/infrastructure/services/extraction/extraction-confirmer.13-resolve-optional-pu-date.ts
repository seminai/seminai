import type { ExtractionConfirmerContext } from './extraction-confirmer.context';

export function extractionConfirmerResolveOptionalPuDate(this: ExtractionConfirmerContext, value: unknown): Date | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return new Date(value);
    if (value instanceof Date) return value;
    return undefined;
  }
