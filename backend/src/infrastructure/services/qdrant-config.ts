import { requireConfiguredFeature } from '../runtime/requireConfiguredFeature';

export interface QdrantConnectionConfig {
  readonly url: string;
  readonly apiKey: string;
}

/** Normalizes Qdrant REST URL (Cloud often requires explicit :6333). */
export function normalizeQdrantUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed.includes('cloud.qdrant.io')) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (!parsed.port) {
      parsed.port = '6333';
      return parsed.toString().replace(/\/+$/, '');
    }
  } catch {
    return `${trimmed}:6333`;
  }
  return trimmed;
}

export function resolveQdrantConnectionConfig(): QdrantConnectionConfig {
  const rawUrl = requireConfiguredFeature('Qdrant', process.env.QDRANT_URL);
  return {
    url: normalizeQdrantUrl(rawUrl),
    apiKey: process.env.QDRANT_API_KEY ?? '',
  };
}

export function buildQdrantHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['api-key'] = apiKey;
  }
  return headers;
}
