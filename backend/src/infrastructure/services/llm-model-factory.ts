import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { ChatOpenAI } from '@langchain/openai';
import { buildOpenRouterHeaders } from './llm-gateway-headers';
import { resolveChatModelConfig, type ChatModelProvider } from './llm-config';

export interface CreateChatModelOptions {
  readonly modelName?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly timeout?: number;
  readonly streaming?: boolean;
  readonly callbacks?: readonly BaseCallbackHandler[];
  readonly promptCacheKey?: string;
}

export interface CreatedChatModel {
  readonly model: ChatOpenAI;
  readonly modelName: string;
  readonly gateway: 'openrouter' | 'openai';
  readonly provider: ChatModelProvider;
}

export function createChatModel(options: CreateChatModelOptions = {}): CreatedChatModel {
  const config = resolveChatModelConfig(options.modelName);
  if (config.provider === 'claude') {
    return {
      model: new ChatAnthropic({
        model: config.modelName,
        anthropicApiKey: config.apiKey,
        apiKey: config.apiKey,
        temperature: options.temperature ?? 0,
        maxTokens: options.maxTokens,
        streaming: options.streaming,
        callbacks: options.callbacks ? [...options.callbacks] : undefined,
      }) as unknown as ChatOpenAI,
      modelName: config.modelName,
      gateway: config.gateway,
      provider: config.provider,
    };
  }
  const cacheOptions =
    config.gateway === 'openai' && options.promptCacheKey
      ? { promptCacheKey: options.promptCacheKey }
      : {};
  const routerOptions = config.baseUrl
    ? {
        configuration: {
          baseURL: config.baseUrl,
          defaultHeaders:
            config.gateway === 'openrouter'
              ? buildOpenRouterHeaders(config.referer, config.title)
              : undefined,
        },
      }
    : {};
  return {
    model: new ChatOpenAI({
      modelName: config.modelName,
      temperature: options.temperature ?? 0,
      maxTokens: options.maxTokens,
      timeout: options.timeout,
      streaming: options.streaming,
      callbacks: options.callbacks ? [...options.callbacks] : undefined,
      apiKey: config.apiKey,
      openAIApiKey: config.apiKey,
      ...cacheOptions,
      ...routerOptions,
    }),
    modelName: config.modelName,
    gateway: config.gateway,
    provider: config.provider,
  };
}
