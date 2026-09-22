/**
 * LLM Provider service for dosage operations.
 * Preserves the call-with-fallback API while routing chat models through the
 * centralized gateway factory.
 */

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { type LlmError } from './llmErrorHandler';
import { DosageAgentContext, hasContext } from './context';
import { DosageLoggerService } from '../../dosage-logger.service';
import { createChatModel } from '../../llm-model-factory';
import { resolveChatGateway, type ChatModelProvider } from '../../llm-config';

/** Available LLM providers */
export enum LlmProvider {
  OPENAI = 'openai',
  CLAUDE = 'claude',
  OPENROUTER = 'openrouter',
}

/** Operations that can use the LLM provider */
export type LlmOperation =
  | 'orchestrator'
  | 'crop-matcher'
  | 'date-range'
  | 'treatment-planning'
  | 'dosage-details'
  | 'treatment-strategy'
  | 'compatibility-check'
  | 'buffer-zone'
  | 'timing-inference'
  | 'bbch-mapping'
  | 'product-name-matcher'
  | 'phenology-prediction'
  | 'weather-advisor'
  | 'disciplinari-limits';

/** Result of a call with fallback */
export interface LlmCallWithFallbackResult<T> {
  readonly result: T;
  readonly usedProvider: LlmProvider;
  readonly usedModel: string;
  readonly fallbackUsed: boolean;
  readonly primaryError?: LlmError;
}

/** Model options for LLM instantiation */
export interface LlmModelOptions {
  readonly temperature?: number;
  readonly maxTokens?: number;
}

/** In-memory fallback statistics for monitoring */
const fallbackStats = {
  claudeAttempts: 0,
  claudeSuccesses: 0,
  fallbacksToOpenAi: 0,
  bothFailed: 0,
};

/** Returns a snapshot of fallback statistics */
export function getFallbackStats(): Readonly<typeof fallbackStats> {
  return { ...fallbackStats };
}

/** ENV variable keys for per-operation provider override */
const OPERATION_ENV_KEYS: Partial<Record<LlmOperation, string>> = {
  orchestrator: 'DOSAGE_ORCHESTRATOR_PROVIDER',
  'crop-matcher': 'DOSAGE_CROP_MATCHER_PROVIDER',
};

/**
 * Resolves which provider to use for a given operation based on ENV configuration.
 * Legacy values are preserved for callers, but OpenRouter is preferred when configured.
 */
export function resolveProvider(operation: LlmOperation): LlmProvider {
  const envKey = OPERATION_ENV_KEYS[operation];
  const configured = envKey ? (process.env[envKey] || '').toLowerCase() : '';
  if (configured === 'claude') return LlmProvider.CLAUDE;
  if (configured === 'openai') return LlmProvider.OPENAI;
  if (resolveChatGateway() === 'openrouter') {
    return LlmProvider.OPENROUTER;
  }
  return LlmProvider.OPENAI;
}

function resolveOperationModelName(operation: LlmOperation): string {
  const envKey = OPERATION_ENV_KEYS[operation];
  const configured = envKey ? process.env[envKey] : undefined;
  if (configured && !['openai', 'claude', 'openrouter'].includes(configured.toLowerCase())) {
    return configured;
  }
  if (configured?.toLowerCase() === 'claude') {
    return process.env.LLM_STRONG_MODEL || process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
  }
  if (configured?.toLowerCase() === 'openai') {
    return process.env.OPENAI_MODEL || 'gpt-4o-mini';
  }
  return (
    process.env.LLM_STRONG_MODEL ||
    process.env.LLM_DEFAULT_MODEL ||
    process.env.CLAUDE_MODEL ||
    process.env.OPENAI_MODEL ||
    'gpt-4o-mini'
  );
}

function mapModelProviderToLlmProvider(provider: ChatModelProvider): LlmProvider {
  if (provider === 'openrouter') {
    return LlmProvider.OPENROUTER;
  }
  if (provider === 'claude') {
    return LlmProvider.CLAUDE;
  }
  return LlmProvider.OPENAI;
}

function getProviderLabel(provider: LlmProvider): string {
  if (provider === LlmProvider.OPENROUTER) {
    return 'OpenRouter';
  }
  if (provider === LlmProvider.CLAUDE) {
    return LlmProvider.CLAUDE;
  }
  return 'OpenAI';
}

/**
 * Extracts text content from an LLM response.
 * Handles both string content (OpenAI) and content block arrays (Claude).
 */
export function extractResponseText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter(
        (block): block is { type: string; text: string } =>
          typeof block === 'object' &&
          block !== null &&
          block.type === 'text' &&
          typeof block.text === 'string',
      )
      .map((block) => block.text)
      .join('');
  }
  return '';
}

/**
 * Executes an LLM call through the configured chat gateway.
 */
export async function callWithFallback<T>(params: {
  readonly operation: LlmOperation;
  readonly execute: (model: BaseChatModel, modelName: string) => Promise<T>;
  readonly context?: DosageAgentContext;
  readonly modelOptions?: LlmModelOptions;
}): Promise<LlmCallWithFallbackResult<T>> {
  const { operation, execute, context, modelOptions } = params;
  const provider = resolveProvider(operation);
  return executeDirectGateway(operation, execute, context, modelOptions, provider);
}

async function executeDirectGateway<T>(
  operation: LlmOperation,
  execute: (model: BaseChatModel, modelName: string) => Promise<T>,
  context: DosageAgentContext | undefined,
  modelOptions?: LlmModelOptions,
  providerOverride?: LlmProvider,
): Promise<LlmCallWithFallbackResult<T>> {
  const requestedModelName = resolveOperationModelName(operation);
  const created = createChatModel({
    modelName: requestedModelName,
    temperature: modelOptions?.temperature,
    maxTokens: modelOptions?.maxTokens,
  });
  const provider = providerOverride ?? mapModelProviderToLlmProvider(created.provider);
  const modelName = created.modelName;
  const model = created.model;
  const result = await execute(model, modelName);
  console.log(`[LLM-PROVIDER] ${operation}: ${getProviderLabel(provider)} success (${modelName})`);
  if (provider === LlmProvider.OPENROUTER) {
    logGatewayInfo(context, operation, modelName);
  }
  return {
    result,
    usedProvider: provider,
    usedModel: modelName,
    fallbackUsed: false,
  };
}

function logGatewayInfo(
  context: DosageAgentContext | undefined,
  operation: LlmOperation,
  modelName: string,
): void {
  if (!hasContext(context)) {
    return;
  }
  const logger = DosageLoggerService.getInstance();
  logger.logInfo({
    jobId: context.jobId,
    userId: context.userId,
    message: `LLM gateway routed ${operation} through OpenRouter`,
    metadata: { operation, modelName },
  });
}
