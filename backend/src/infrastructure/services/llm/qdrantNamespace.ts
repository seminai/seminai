import { resolveConfiguredLlmProvider, type LlmProvider } from '../../runtime/llmProviders';

export const OLLAMA_EMBEDDING_MODEL = 'nomic-embed-text';
export const OLLAMA_EMBEDDING_DIMENSION = 768;
export const DEFAULT_OPENAI_EMBEDDING_DIMENSION = 1536;

export interface QdrantNamespaceInput {
  readonly purpose: string;
  readonly provider: string;
  readonly model: string;
  readonly dimension: number;
}

export function slugCollectionPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function embeddingDimensionFor(provider: LlmProvider, model: string): number {
  if (provider === 'ollama' || model.includes('nomic-embed')) return OLLAMA_EMBEDDING_DIMENSION;
  if (model.includes('3-large') || model.includes('3072')) return 3072;
  return DEFAULT_OPENAI_EMBEDDING_DIMENSION;
}

export function defaultEmbeddingModel(provider: LlmProvider): string {
  return provider === 'ollama' ? OLLAMA_EMBEDDING_MODEL : 'text-embedding-3-small';
}

/** Collection name namespaced by provider, embedding model, and vector size. */
export function buildQdrantCollectionName(input: QdrantNamespaceInput): string {
  return [
    slugCollectionPart(input.purpose),
    slugCollectionPart(input.provider),
    slugCollectionPart(input.model),
    String(input.dimension),
  ].join('_');
}

export function resolveRulesQdrantCollection(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const provider = resolveConfiguredLlmProvider(env);
  const model = env.LLM_EMBEDDING_MODEL || defaultEmbeddingModel(provider);
  return buildQdrantCollectionName({
    purpose: 'rules',
    provider,
    model,
    dimension: embeddingDimensionFor(provider, model),
  });
}
