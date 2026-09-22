/**
 * Multi-provider model router for agent tool calls.
 * Selects a chat model based on task complexity and delegates model creation
 * to the centralized LLM gateway factory.
 */

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createChatModel } from '../../llm-model-factory';
import {
  ChatModelProvider,
  hasClaudeApiKey,
  resolveChatGateway,
  resolveModelForComplexity,
} from '../../llm-config';

export type TaskComplexity = 'low' | 'medium' | 'high';

export type ModelProvider = ChatModelProvider;

export interface ModelRouterConfig {
  preferredProvider?: ModelProvider;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  /**
   * OpenAI prompt cache routing key. Same key → same cache shard → higher hit rate
   * on identical prefixes (system prompt + tool schemas). Ignored for Claude.
   */
  promptCacheKey?: string;
}

export interface ModelSelection {
  model: BaseChatModel;
  modelName: string;
  provider: ModelProvider;
  complexity: TaskComplexity;
}

export interface ModelRoutingFingerprint {
  readonly provider: ModelProvider;
  readonly low: string;
  readonly medium: string;
  readonly high: string;
}

/** Default model map retained for inspection and legacy provider preferences. */
const MODEL_MAP: Record<'claude' | 'openai', Record<TaskComplexity, string>> = {
  claude: {
    low: 'claude-haiku-4-5-20251001',
    medium: 'claude-sonnet-4-20250514',
    high: 'claude-sonnet-4-20250514',
  },
  openai: {
    low: 'gpt-4o-mini',
    medium: 'gpt-4o',
    high: 'gpt-4o',
  },
};

/**
 * Resolves the preferred provider from config or environment.
 * Falls back to the configured gateway when no explicit preference is set.
 */
function resolvePreferredProvider(config?: ModelRouterConfig): ModelProvider {
  if (config?.preferredProvider) return config.preferredProvider;
  const envProvider = (process.env.AGENT_PREFERRED_PROVIDER || '').toLowerCase();
  if (envProvider === 'claude' && (resolveChatGateway() === 'openrouter' || hasClaudeApiKey())) {
    return 'claude';
  }
  if (envProvider === 'openai') return 'openai';
  if (resolveChatGateway() === 'openrouter') return 'openrouter';
  return 'openai';
}

/**
 * Selects the appropriate model based on task complexity and provider preference.
 */
export function createModelForTask(
  complexity: TaskComplexity,
  config?: ModelRouterConfig,
): ModelSelection {
  const preferred = resolvePreferredProvider(config);
  const temperature = config?.temperature ?? 0;
  const requestedModelName = config?.modelName ?? resolveRequestedModelName(preferred, complexity);
  const created = createChatModel({
    modelName: requestedModelName,
    temperature,
    maxTokens: config?.maxTokens,
    promptCacheKey: config?.promptCacheKey,
  });
  return {
    model: created.model as BaseChatModel,
    modelName: created.modelName,
    provider: created.provider,
    complexity,
  };
}

export function resolveModelRoutingFingerprint(
  config?: Pick<ModelRouterConfig, 'preferredProvider' | 'modelName'>,
): ModelRoutingFingerprint {
  const preferred = resolvePreferredProvider(config);
  const resolve = (complexity: TaskComplexity) =>
    config?.modelName ?? resolveRequestedModelName(preferred, complexity);
  return {
    provider: preferred,
    low: resolve('low'),
    medium: resolve('medium'),
    high: resolve('high'),
  };
}

function resolveRequestedModelName(provider: ModelProvider, complexity: TaskComplexity): string {
  if (provider === 'claude') return MODEL_MAP.claude[complexity];
  if (provider === 'openai') return MODEL_MAP.openai[complexity];
  return resolveModelForComplexity(complexity);
}

/**
 * Returns the model map for inspection/logging purposes.
 */
export function getModelMap(): Readonly<typeof MODEL_MAP> {
  return MODEL_MAP;
}
