import { OpenAIEmbeddings } from '@langchain/openai';
import { resolveEmbeddingsConfig } from './llm-config';

export interface CreateEmbeddingsOptions {
  readonly modelName?: string;
}

export interface CreatedEmbeddings {
  readonly embeddings: OpenAIEmbeddings;
  readonly modelName: string;
  readonly gateway: 'openai';
}

/** Creates OpenAI-native embeddings (always api.openai.com, never OpenRouter). */
export function createEmbeddings(options: CreateEmbeddingsOptions = {}): CreatedEmbeddings {
  const config = resolveEmbeddingsConfig(options.modelName);
  return {
    embeddings: new OpenAIEmbeddings({
      modelName: config.modelName,
      openAIApiKey: config.apiKey,
      apiKey: config.apiKey,
    }),
    modelName: config.modelName,
    gateway: 'openai',
  };
}
