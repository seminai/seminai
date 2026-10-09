import { AppError } from '../../domain/errors/AppError';

/** Existing configured installations keep AI; fresh instances do not enable it implicitly. */
export function isAiEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (env.AI_ENABLED !== undefined) return env.AI_ENABLED === 'true';
  return Boolean(env.LLM_GATEWAY) || env.SETUP_COMPLETED === 'true' || env.NODE_ENV === 'test';
}

export function requireAiEnabled(): void {
  if (!isAiEnabled())
    throw AppError.conflict(
      'Intelligenza artificiale disattivata. Configurala nelle integrazioni.',
      'AI_DISABLED',
    );
}

export function getAiCapabilities(env: Readonly<Record<string, string | undefined>> = process.env) {
  const enabled = isAiEnabled(env);
  return {
    enabled,
    chat: enabled && Boolean(env.LLM_DEFAULT_MODEL),
    vision: enabled && env.AI_VISION_ENABLED === 'true' && Boolean(env.LLM_VISION_MODEL),
    audio:
      enabled &&
      env.AI_AUDIO_ENABLED === 'true' &&
      Boolean(env.LLM_AUDIO_MODEL) &&
      ['openai', 'openrouter'].includes(env.LLM_GATEWAY || ''),
    embeddings:
      enabled &&
      env.AI_EMBEDDINGS_ENABLED === 'true' &&
      Boolean(env.LLM_EMBEDDING_MODEL) &&
      env.LLM_GATEWAY !== 'anthropic',
  };
}

export function requireAiCapability(capability: 'vision' | 'audio' | 'embeddings'): void {
  requireAiEnabled();
  if (!getAiCapabilities()[capability] && process.env.AI_ENABLED !== undefined)
    throw AppError.conflict(
      'Capacità AI non configurata nelle integrazioni',
      'AI_CAPABILITY_DISABLED',
    );
}
