import { guardAiClient } from '../runtime/guardAiClient';
import { requireAiCapability } from '../runtime/aiCapabilities';
import { OpenAIEmbeddings } from '@langchain/openai';
import { resolveEmbeddingsConfig } from './llm-config';
import { resolveLocalFirstEmbeddings } from './llm/localFirstEmbeddings';

export interface CreateEmbeddingsOptions {
  readonly modelName?: string;
}

export interface CreatedEmbeddings {
  readonly embeddings: OpenAIEmbeddings;
  readonly modelName: string;
  readonly gateway: 'openai';
  readonly dimension?: number;
}

/** Creates embeddings for the active local-first or OpenAI-native provider. */
export function createEmbeddings(options: CreateEmbeddingsOptions = {}): CreatedEmbeddings {
  requireAiCapability('embeddings');
  const local = resolveLocalFirstEmbeddings(process.env, options.modelName);
  if (local) {
    return {
      embeddings: guardAiClient(new OpenAIEmbeddings({
        modelName: local.modelName,
        openAIApiKey: local.apiKey,
        apiKey: local.apiKey,
        configuration: local.baseUrl ? { baseURL: local.baseUrl } : undefined,
      })),
      modelName: local.modelName,
      gateway: 'openai',
      dimension: local.dimension,
    };
  }
  if (process.env.LLM_GATEWAY === 'openrouter') {
    const modelName = options.modelName || process.env.LLM_EMBEDDING_MODEL!;
    return { embeddings: guardAiClient(new OpenAIEmbeddings({ model: modelName, apiKey: process.env.OPENROUTER_API_KEY, configuration: { baseURL: 'https://openrouter.ai/api/v1' } })), modelName, gateway: 'openai' };
  }
  const config = resolveEmbeddingsConfig(options.modelName);
  return {
    embeddings: guardAiClient(new OpenAIEmbeddings({
      modelName: config.modelName,
      openAIApiKey: config.apiKey,
      apiKey: config.apiKey,
    })),
    modelName: config.modelName,
    gateway: 'openai',
  };
}
