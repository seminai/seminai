import { resolveConfiguredLlmProvider } from '../../runtime/llmProviders';
import {
  defaultEmbeddingModel,
  embeddingDimensionFor,
  OLLAMA_EMBEDDING_MODEL,
} from './qdrantNamespace';

export interface LocalFirstEmbeddingsConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly modelName: string;
  readonly dimension: number;
}

export function resolveLocalFirstEmbeddings(
  env: Readonly<Record<string, string | undefined>> = process.env,
  modelName?: string,
): LocalFirstEmbeddingsConfig | undefined {
  const provider = resolveConfiguredLlmProvider(env);
  if (provider === 'ollama') {
    const base = (env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
    const model = modelName || env.LLM_EMBEDDING_MODEL || OLLAMA_EMBEDDING_MODEL;
    return {
      apiKey: env.OLLAMA_API_KEY || 'ollama',
      baseUrl: `${base}/v1`,
      modelName: model,
      dimension: embeddingDimensionFor(provider, model),
    };
  }
  if (provider === 'openai-compatible') {
    const base = (env.OPENAI_COMPATIBLE_BASE_URL || env.OPENAI_BASE_URL || '').replace(/\/$/, '');
    if (!base) return undefined;
    const model = modelName || env.LLM_EMBEDDING_MODEL || defaultEmbeddingModel(provider);
    return {
      apiKey: env.OPENAI_COMPATIBLE_API_KEY || env.OPENAI_API_KEY || 'local',
      baseUrl: base.endsWith('/v1') ? base : `${base}/v1`,
      modelName: model,
      dimension: embeddingDimensionFor(provider, model),
    };
  }
  return undefined;
}

export function hasLocalFirstEmbeddings(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const provider = resolveConfiguredLlmProvider(env);
  if (provider === 'ollama') return true;
  if (provider === 'openai-compatible') {
    return Boolean(env.OPENAI_COMPATIBLE_BASE_URL || env.OPENAI_BASE_URL);
  }
  return Boolean(env.OPENAI_API_KEY);
}
