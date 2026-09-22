import type { ExtractionConfirmerContext } from './extraction-confirmer.context';

export function extractionConfirmerResolvePuDate(this: ExtractionConfirmerContext, value: unknown): Date {
    if (!value) return new Date();
    if (typeof value === 'string') return new Date(value);
    if (value instanceof Date) return value;
    return new Date();
  }
