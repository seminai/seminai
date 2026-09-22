import {
  CLAUDE_MODEL_ALIASES,
  DEFAULT_OPENAI_EMBEDDING_MODEL,
  DEFAULT_OPENAI_LABEL_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_VISION_MODEL,
  DEFAULT_OPENROUTER_AUDIO_MODEL,
  DEFAULT_OPENROUTER_BASE_URL,
  DEFAULT_OPENROUTER_EMBEDDING_MODEL,
  DEFAULT_OPENROUTER_LABEL_MODEL,
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_OPENROUTER_VISION_MODEL,
  OPENAI_EMBEDDING_ALIASES,
  OPENAI_MODEL_ALIASES,
  OPENROUTER_EMBEDDING_ALIASES,
  OPENROUTER_MODEL_ALIASES,
} from './llm-config-aliases';
import { parseLlmProvider } from '../runtime/llmProviders';
import { hasLocalFirstEmbeddings } from './llm/localFirstEmbeddings';

export type ChatGateway = 'openrouter' | 'openai';

export type ChatModelProvider = 'openrouter' | 'openai' | 'claude';

export type ChatTaskComplexity = 'low' | 'medium' | 'high';

export interface ResolvedGatewayConfig {
  readonly gateway: ChatGateway;
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly referer?: string;
  readonly title?: string;
}

export interface ResolvedChatModelConfig extends ResolvedGatewayConfig {
  readonly modelName: string;
  readonly provider: ChatModelProvider;
}

export interface ResolvedEmbeddingsConfig extends ResolvedGatewayConfig {
  readonly modelName: string;
}

export interface ResolvedVisionConfig extends ResolvedGatewayConfig {
  readonly modelName: string;
}

function configuredProvider(): string {
  return (process.env.LLM_GATEWAY || '').toLowerCase();
}

function isOllamaGateway(): boolean {
  return configuredProvider() === 'ollama';
}

export function resolveChatGateway(): ChatGateway {
  const configured = configuredProvider();
  if (configured === 'ollama' || configured === 'openai-compatible' || configured === 'anthropic' || configured === 'openai') {
    return 'openai';
  }
  return 'openrouter';
}

export function hasClaudeApiKey(): boolean {
  return Boolean(process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY);
}

export function hasChatLlmApiKey(): boolean {
  if (isOllamaGateway()) return true;
  const provider = parseLlmProvider(process.env.LLM_GATEWAY);
  if (provider === 'openai-compatible') {
    return Boolean(process.env.OPENAI_COMPATIBLE_BASE_URL || process.env.OPENAI_BASE_URL);
  }
  if (provider === 'anthropic') return hasClaudeApiKey();
  const gateway = resolveChatGateway();
  if (gateway === 'openrouter') return Boolean(process.env.OPENROUTER_API_KEY);
  return Boolean(process.env.OPENAI_API_KEY) || hasClaudeApiKey();
}

export function isClaudeModelName(modelName: string): boolean {
  const normalized = modelName.toLowerCase();
  return normalized.includes('claude') || normalized.startsWith('anthropic/');
}

export function resolveDefaultVisionModel(): string {
  return resolveVisionModelName();
}

export function resolveDefaultChatModel(): string {
  return (
    process.env.LLM_DEFAULT_MODEL ||
    process.env.OPENROUTER_MODEL ||
    process.env.OPENAI_MODEL ||
    DEFAULT_OPENAI_MODEL
  );
}

export function resolveModelForComplexity(complexity: ChatTaskComplexity): string {
  if (complexity === 'low') {
    return process.env.LLM_FAST_MODEL || process.env.LLM_DEFAULT_MODEL || DEFAULT_OPENAI_MODEL;
  }
  if (complexity === 'medium') {
    return process.env.LLM_DEFAULT_MODEL || process.env.LLM_STRONG_MODEL || 'gpt-4o';
  }
  return process.env.LLM_STRONG_MODEL || process.env.LLM_DEFAULT_MODEL || 'gpt-4o';
}

export function resolveChatModelName(modelName?: string, gateway = resolveChatGateway()): string {
  const requestedModel = modelName || resolveDefaultChatModel();
  if (gateway === 'openrouter') {
    return OPENROUTER_MODEL_ALIASES[requestedModel] || requestedModel || DEFAULT_OPENROUTER_MODEL;
  }
  const openAiNormalized =
    OPENAI_MODEL_ALIASES[requestedModel] || requestedModel || DEFAULT_OPENAI_MODEL;
  if (isClaudeModelName(openAiNormalized)) {
    return (
      CLAUDE_MODEL_ALIASES[openAiNormalized] ||
      CLAUDE_MODEL_ALIASES[requestedModel] ||
      openAiNormalized
    );
  }
  return openAiNormalized;
}

export function resolveChatModelProvider(
  modelName: string,
  gateway = resolveChatGateway(),
): ChatModelProvider {
  if (configuredProvider() === 'anthropic' || isClaudeModelName(modelName)) {
    if (gateway !== 'openrouter') return 'claude';
  }
  if (gateway === 'openrouter') return 'openrouter';
  return 'openai';
}

export function resolveGatewayConfig(): ResolvedGatewayConfig {
  if (isOllamaGateway()) {
    const base = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
    return {
      gateway: 'openai',
      apiKey: process.env.OLLAMA_API_KEY || 'ollama',
      baseUrl: `${base}/v1`,
    };
  }
  if (configuredProvider() === 'openai-compatible') {
    const base = (process.env.OPENAI_COMPATIBLE_BASE_URL || process.env.OPENAI_BASE_URL || '').replace(/\/$/, '');
    return {
      gateway: 'openai',
      apiKey: process.env.OPENAI_COMPATIBLE_API_KEY || process.env.OPENAI_API_KEY || 'local',
      baseUrl: base ? (base.endsWith('/v1') ? base : `${base}/v1`) : undefined,
    };
  }
  if (configuredProvider() === 'anthropic') {
    return {
      gateway: 'openai',
      apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || requireEnv('CLAUDE_API_KEY'),
    };
  }
  const gateway = resolveChatGateway();
  if (gateway === 'openrouter') {
    return {
      gateway,
      apiKey: requireEnv('OPENROUTER_API_KEY'),
      baseUrl: process.env.OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE_URL,
      referer: process.env.OPENROUTER_HTTP_REFERER || process.env.FRONTEND_URL,
      title: process.env.OPENROUTER_APP_TITLE || process.env.APP_NAME || 'Seminai',
    };
  }
  return {
    gateway,
    apiKey: requireEnv('OPENAI_API_KEY'),
  };
}

export function resolveEmbeddingsModelName(
  modelName?: string,
  gateway = resolveChatGateway(),
): string {
  const requestedModel =
    modelName || process.env.LLM_EMBEDDING_MODEL || DEFAULT_OPENAI_EMBEDDING_MODEL;
  if (gateway === 'openrouter') {
    return (
      OPENROUTER_EMBEDDING_ALIASES[requestedModel] ||
      requestedModel ||
      DEFAULT_OPENROUTER_EMBEDDING_MODEL
    );
  }
  return (
    OPENAI_EMBEDDING_ALIASES[requestedModel] || requestedModel || DEFAULT_OPENAI_EMBEDDING_MODEL
  );
}

export function resolveVisionModelName(modelName?: string, gateway = resolveChatGateway()): string {
  const requestedModel =
    modelName ||
    process.env.LLM_VISION_MODEL ||
    (gateway === 'openrouter' ? DEFAULT_OPENROUTER_VISION_MODEL : DEFAULT_OPENAI_VISION_MODEL);
  return resolveChatModelName(requestedModel, gateway);
}

export function resolveAudioModelName(): string {
  return process.env.LLM_AUDIO_MODEL || DEFAULT_OPENROUTER_AUDIO_MODEL;
}

export function resolveLabelExtractionModelName(
  modelName?: string,
  gateway = resolveChatGateway(),
): string {
  const requestedModel =
    modelName || process.env.LLM_LABEL_EXTRACTION_MODEL || DEFAULT_OPENAI_LABEL_MODEL;
  if (gateway === 'openrouter') {
    if (requestedModel.includes('/')) return requestedModel;
    if (requestedModel.startsWith('mistral')) {
      return `mistralai/${requestedModel.replace(/^mistral-?/i, 'mistral-')}`;
    }
    return (
      OPENROUTER_MODEL_ALIASES[requestedModel] || requestedModel || DEFAULT_OPENROUTER_LABEL_MODEL
    );
  }
  return OPENAI_MODEL_ALIASES[requestedModel] || requestedModel || DEFAULT_OPENAI_LABEL_MODEL;
}

export function resolveEmbeddingsConfig(modelName?: string): ResolvedEmbeddingsConfig {
  return {
    gateway: 'openai',
    apiKey: requireEnv('OPENAI_API_KEY'),
    modelName: resolveEmbeddingsModelName(modelName, 'openai'),
  };
}

export function resolveVisionConfig(modelName?: string): ResolvedVisionConfig {
  const gatewayConfig = resolveGatewayConfig();
  return {
    ...gatewayConfig,
    modelName: resolveVisionModelName(modelName, gatewayConfig.gateway),
  };
}

export function resolveChatModelConfig(modelName?: string): ResolvedChatModelConfig {
  if (configuredProvider() === 'anthropic') {
    const gatewayConfig = resolveGatewayConfig();
    return {
      ...gatewayConfig,
      modelName: resolveChatModelName(modelName, 'openai'),
      provider: 'claude',
    };
  }
  if (isOllamaGateway() || configuredProvider() === 'openai-compatible') {
    const gatewayConfig = resolveGatewayConfig();
    return {
      ...gatewayConfig,
      modelName: resolveChatModelName(modelName, 'openai'),
      provider: 'openai',
    };
  }
  const gateway = resolveChatGateway();
  const resolvedModelName = resolveChatModelName(modelName, gateway);
  if (gateway === 'openrouter') {
    const gatewayConfig = resolveGatewayConfig();
    return {
      ...gatewayConfig,
      modelName: resolvedModelName,
      provider: 'openrouter',
    };
  }
  const provider = resolveChatModelProvider(resolvedModelName, gateway);
  if (provider === 'claude') {
    return {
      gateway,
      apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || requireEnv('CLAUDE_API_KEY'),
      modelName: resolvedModelName,
      provider,
    };
  }
  return {
    gateway,
    apiKey: requireEnv('OPENAI_API_KEY'),
    modelName: resolvedModelName,
    provider: 'openai',
  };
}

export function hasEmbeddingsApiKey(): boolean {
  return hasLocalFirstEmbeddings();
}

export function hasLlmGatewayKey(): boolean {
  return hasChatLlmApiKey() || hasEmbeddingsApiKey();
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} environment variable is required`);
  }
  return value;
}
