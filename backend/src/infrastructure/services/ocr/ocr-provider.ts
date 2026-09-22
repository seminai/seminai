export type OcrProvider = 'mistral' | 'openai';

export const DEFAULT_OCR_PROVIDER: OcrProvider = 'mistral';

export function resolveOcrProvider(raw?: unknown): OcrProvider {
  if (raw === 'openai') {
    return 'openai';
  }
  return DEFAULT_OCR_PROVIDER;
}
