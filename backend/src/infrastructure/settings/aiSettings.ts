import { AppError } from '../../domain/errors/AppError';
import { resetInstanceSettingStoreCache } from './instanceSettingSingleton';
import { prisma } from '../repositories/Prisma';
import { encryptAesGcm } from './aesGcm';
import { parseLlmProvider } from '../runtime/llmProviders';
import { getAiCapabilities, isAiEnabled } from '../runtime/aiCapabilities';

const providerSecrets = [
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'CLAUDE_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_COMPATIBLE_API_KEY',
];
const providerEndpoints = [
  'OPENAI_BASE_URL',
  'OPENAI_COMPATIBLE_BASE_URL',
  'OLLAMA_BASE_URL',
  'OPENROUTER_BASE_URL',
];
const secretNames: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  anthropic: 'CLAUDE_API_KEY',
  'openai-compatible': 'OPENAI_COMPATIBLE_API_KEY',
};

export interface AiSettingsInput {
  readonly enabled: boolean;
  readonly provider: string;
  readonly model: string;
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly vision?: boolean;
  readonly audio?: boolean;
  readonly embeddings?: boolean;
  readonly visionModel?: string;
  readonly audioModel?: string;
  readonly embeddingModel?: string;
}

/** Runtime settings are updated together; no credential is returned to the renderer. */
export async function readAiSettings() {
  return {
    enabled: isAiEnabled(),
    provider: process.env.LLM_GATEWAY || 'ollama',
    model: process.env.LLM_DEFAULT_MODEL || '',
    baseUrl: process.env.OLLAMA_BASE_URL || process.env.OPENAI_COMPATIBLE_BASE_URL || '',
    hasApiKey: Boolean(
      process.env.LLM_API_KEY || process.env[secretNames[process.env.LLM_GATEWAY || '']],
    ),
    capabilities: getAiCapabilities(),
    visionModel: process.env.LLM_VISION_MODEL || '',
    audioModel: process.env.LLM_AUDIO_MODEL || '',
    embeddingModel: process.env.LLM_EMBEDDING_MODEL || '',
  };
}

export async function saveAiSettings(
  input: AiSettingsInput,
): Promise<Awaited<ReturnType<typeof readAiSettings>>> {
  const provider = parseLlmProvider(input.provider);
  if (!provider || typeof input.enabled !== 'boolean' || typeof input.model !== 'string')
    throw AppError.badRequest('Configurazione AI non valida', 'INVALID_AI_SETTINGS');
  const changedProvider = provider !== process.env.LLM_GATEWAY;
  const apiKey =
    input.apiKey ??
    (changedProvider ? '' : process.env.LLM_API_KEY || process.env[secretNames[provider]] || '');
  if (input.enabled && !input.model.trim())
    throw AppError.badRequest('Seleziona un modello', 'INVALID_AI_SETTINGS');
  if (input.enabled && !['ollama', 'openai-compatible'].includes(provider) && !apiKey)
    throw AppError.badRequest('Inserisci una chiave API', 'INVALID_AI_SETTINGS');
  const baseUrl = input.baseUrl?.trim() || (provider === 'ollama' ? 'http://127.0.0.1:11434' : '');
  if (baseUrl) validateEndpoint(baseUrl);
  if (input.enabled && provider === 'openai-compatible' && !baseUrl)
    throw AppError.badRequest('Inserisci un endpoint', 'INVALID_AI_SETTINGS');
  for (const [capability, model] of [
    ['vision', input.visionModel],
    ['audio', input.audioModel],
    ['embeddings', input.embeddingModel],
  ] as const) {
    if (input[capability] && (typeof model !== 'string' || !model.trim()))
      throw AppError.badRequest(
        'Specifica un modello per ogni capacità abilitata',
        'INVALID_AI_SETTINGS',
      );
  }
  if (input.audio && !['openai', 'openrouter'].includes(provider))
    throw AppError.badRequest(
      'Trascrizione audio disponibile con OpenAI o OpenRouter',
      'INVALID_AI_SETTINGS',
    );
  if (input.embeddings && provider === 'anthropic')
    throw AppError.badRequest('Questo provider non offre embeddings', 'INVALID_AI_SETTINGS');
  const entries: Record<string, string> = {
    'ai.visionModel': input.visionModel?.trim() || '',
    'ai.audioModel': input.audioModel?.trim() || '',
    'ai.embeddingModel': input.embeddingModel?.trim() || '',
    'ai.enabled': String(input.enabled),
    'llm.provider': provider,
    'llm.model': input.model.trim(),
    'llm.baseUrl': baseUrl,
    'llm.apiKey': apiKey,
    'ai.vision': String(input.vision === true),
    'ai.audio': String(input.audio === true),
    'ai.embeddings': String(input.embeddings === true),
  };
  await prisma.$transaction(
    Object.entries(entries).map(([key, value]) => {
      const valueEnc = encryptAesGcm(value, process.env.ENCRYPTION_SECRET!);
      return prisma.instanceSetting.upsert({
        where: { key },
        create: { key, valueEnc },
        update: { valueEnc },
      });
    }),
  );
  resetInstanceSettingStoreCache();
  for (const name of [...providerSecrets, ...providerEndpoints]) delete process.env[name];
  process.env.AI_ENABLED = String(input.enabled);
  process.env.LLM_GATEWAY = provider;
  process.env.LLM_DEFAULT_MODEL = input.model.trim();
  process.env.LLM_API_KEY = apiKey;
  process.env.OLLAMA_BASE_URL = baseUrl;
  if (secretNames[provider]) process.env[secretNames[provider]] = apiKey;
  if (provider === 'openai-compatible') process.env.OPENAI_COMPATIBLE_BASE_URL = baseUrl;
  for (const capability of ['vision', 'audio', 'embeddings'] as const)
    process.env[`AI_${capability.toUpperCase()}_ENABLED`] = String(input[capability] === true);
  process.env.LLM_VISION_MODEL = entries['ai.visionModel'];
  process.env.LLM_AUDIO_MODEL = entries['ai.audioModel'];
  process.env.LLM_EMBEDDING_MODEL = entries['ai.embeddingModel'];
  return readAiSettings();
}

function validateEndpoint(value: string): void {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new Error();
  } catch {
    throw AppError.badRequest('Endpoint HTTP(S) non valido', 'INVALID_AI_SETTINGS');
  }
}

/** Explicit user-initiated probe; provider errors never fall back to another provider. */
export async function testAiSettings(): Promise<{ reachable: boolean; message: string }> {
  const settings = await readAiSettings();
  if (!settings.enabled)
    return { reachable: false, message: 'Intelligenza artificiale disattivata' };
  const origins: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    anthropic: 'https://api.anthropic.com/v1',
  };
  const base =
    settings.provider === 'ollama' || settings.provider === 'openai-compatible'
      ? settings.baseUrl
      : origins[settings.provider];
  const headers: Record<string, string> = {};
  const key = process.env.LLM_API_KEY || process.env[secretNames[settings.provider]] || '';
  if (key) headers.Authorization = `Bearer ${key}`;
  if (settings.provider === 'anthropic') {
    delete headers.Authorization;
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
  }
  try {
    const response = await fetch(
      `${base.replace(/\/$/, '')}/${settings.provider === 'ollama' ? 'api/tags' : 'models'}`,
      { headers, signal: AbortSignal.timeout(8000), redirect: 'error' },
    );
    return {
      reachable: response.ok,
      message: response.ok
        ? 'Collegamento riuscito'
        : `Il provider ha risposto con stato ${response.status}`,
    };
  } catch {
    return {
      reachable: false,
      message: 'Provider non raggiungibile. Le funzioni manuali restano disponibili.',
    };
  }
}
