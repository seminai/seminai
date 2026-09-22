export type ChatGateway = 'openrouter' | 'openai';

export type ChatModelProvider = 'openrouter' | 'openai' | 'claude';

export type ChatTaskComplexity = 'low' | 'medium' | 'high';

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
const DEFAULT_OPENROUTER_EMBEDDING_MODEL = 'openai/text-embedding-3-small';
const DEFAULT_OPENAI_VISION_MODEL = 'gpt-4o';
const DEFAULT_OPENROUTER_VISION_MODEL = 'openai/gpt-4o';
const DEFAULT_OPENROUTER_LABEL_MODEL = 'mistralai/mistral-large-2512';
const DEFAULT_OPENAI_LABEL_MODEL = 'mistral-large-latest';
const DEFAULT_OPENROUTER_AUDIO_MODEL = 'google/gemini-2.5-flash';

const OPENROUTER_EMBEDDING_ALIASES: Readonly<Record<string, string>> = {
  'text-embedding-3-small': 'openai/text-embedding-3-small',
  'text-embedding-3-large': 'openai/text-embedding-3-large',
  'text-embedding-ada-002': 'openai/text-embedding-ada-002',
};

const OPENAI_EMBEDDING_ALIASES: Readonly<Record<string, string>> = {
  'openai/text-embedding-3-small': 'text-embedding-3-small',
  'openai/text-embedding-3-large': 'text-embedding-3-large',
  'openai/text-embedding-ada-002': 'text-embedding-ada-002',
};

const OPENROUTER_MODEL_ALIASES: Readonly<Record<string, string>> = {
  'gpt-4o-mini': 'openai/gpt-4o-mini',
  'gpt-4o': 'openai/gpt-4o',
  'gpt-4-turbo': 'openai/gpt-4-turbo',
  'gpt-4': 'openai/gpt-4',
  'gpt-3.5-turbo': 'openai/gpt-3.5-turbo',
  'claude-haiku-4-5-20251001': 'anthropic/claude-haiku-4.5',
  'claude-sonnet-4-20250514': 'anthropic/claude-sonnet-4',
};

const OPENAI_MODEL_ALIASES: Readonly<Record<string, string>> = {
  'openai/gpt-4o-mini': 'gpt-4o-mini',
  'openai/gpt-4o': 'gpt-4o',
  'openai/gpt-4-turbo': 'gpt-4-turbo',
  'openai/gpt-4': 'gpt-4',
  'openai/gpt-3.5-turbo': 'gpt-3.5-turbo',
};

const CLAUDE_MODEL_ALIASES: Readonly<Record<string, string>> = {
  'anthropic/claude-haiku-4.5': 'claude-haiku-4-5-20251001',
  'anthropic/claude-sonnet-4': 'claude-sonnet-4-20250514',
  'claude-haiku-4.5': 'claude-haiku-4-5-20251001',
  'claude-sonnet-4': 'claude-sonnet-4-20250514',
};

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

export function resolveChatGateway(): ChatGateway {
  const configuredGateway = (process.env.LLM_GATEWAY || 'openrouter').toLowerCase();
  if (configuredGateway === 'openai') return 'openai';
  return 'openrouter';
}

export function hasClaudeApiKey(): boolean {
  return Boolean(process.env.CLAUDE_API_KEY);
}

/** Returns true when chat/vision LLM calls can be made (OpenRouter by default). */
export function hasChatLlmApiKey(): boolean {
  const gateway = resolveChatGateway();
  if (gateway === 'openrouter') {
    return Boolean(process.env.OPENROUTER_API_KEY);
  }
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
  if (gateway === 'openrouter') return 'openrouter';
  if (isClaudeModelName(modelName)) return 'claude';
  return 'openai';
}

export function resolveGatewayConfig(): ResolvedGatewayConfig {
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
      apiKey: requireEnv('CLAUDE_API_KEY'),
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
  return Boolean(process.env.OPENAI_API_KEY);
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
