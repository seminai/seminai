export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
export const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';
export const DEFAULT_OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
export const DEFAULT_OPENROUTER_EMBEDDING_MODEL = 'openai/text-embedding-3-small';
export const DEFAULT_OPENAI_VISION_MODEL = 'gpt-4o';
export const DEFAULT_OPENROUTER_VISION_MODEL = 'openai/gpt-4o';
export const DEFAULT_OPENROUTER_LABEL_MODEL = 'mistralai/mistral-large-2512';
export const DEFAULT_OPENAI_LABEL_MODEL = 'mistral-large-latest';
export const DEFAULT_OPENROUTER_AUDIO_MODEL = 'google/gemini-2.5-flash';

export const OPENROUTER_EMBEDDING_ALIASES: Readonly<Record<string, string>> = {
  'text-embedding-3-small': 'openai/text-embedding-3-small',
  'text-embedding-3-large': 'openai/text-embedding-3-large',
  'text-embedding-ada-002': 'openai/text-embedding-ada-002',
};

export const OPENAI_EMBEDDING_ALIASES: Readonly<Record<string, string>> = {
  'openai/text-embedding-3-small': 'text-embedding-3-small',
  'openai/text-embedding-3-large': 'text-embedding-3-large',
  'openai/text-embedding-ada-002': 'text-embedding-ada-002',
};

export const OPENROUTER_MODEL_ALIASES: Readonly<Record<string, string>> = {
  'gpt-4o-mini': 'openai/gpt-4o-mini',
  'gpt-4o': 'openai/gpt-4o',
  'gpt-4-turbo': 'openai/gpt-4-turbo',
  'gpt-4': 'openai/gpt-4',
  'gpt-3.5-turbo': 'openai/gpt-3.5-turbo',
  'claude-haiku-4-5-20251001': 'anthropic/claude-haiku-4.5',
  'claude-sonnet-4-20250514': 'anthropic/claude-sonnet-4',
};

export const OPENAI_MODEL_ALIASES: Readonly<Record<string, string>> = {
  'openai/gpt-4o-mini': 'gpt-4o-mini',
  'openai/gpt-4o': 'gpt-4o',
  'openai/gpt-4-turbo': 'gpt-4-turbo',
  'openai/gpt-4': 'gpt-4',
  'openai/gpt-3.5-turbo': 'gpt-3.5-turbo',
};

export const CLAUDE_MODEL_ALIASES: Readonly<Record<string, string>> = {
  'anthropic/claude-haiku-4.5': 'claude-haiku-4-5-20251001',
  'anthropic/claude-sonnet-4': 'claude-sonnet-4-20250514',
  'claude-haiku-4.5': 'claude-haiku-4-5-20251001',
  'claude-sonnet-4': 'claude-sonnet-4-20250514',
};
