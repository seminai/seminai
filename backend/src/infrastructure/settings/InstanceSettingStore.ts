import { decryptAesGcm, encryptAesGcm } from './aesGcm';
import {
  INSTANCE_SETTING_DEFAULTS,
  INSTANCE_SETTING_ENV,
  type InstanceSettingKey,
} from './instanceSettingKeys';
import type {
  EncryptedSettingStore,
  InstanceSettingDelegate,
} from './encryptedSettingStore';

function encryptionSecret(env: Record<string, string | undefined>): string {
  const secret = env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error('ENCRYPTION_SECRET is not set');
  }
  return secret;
}

function envOverride(key: string, env: Record<string, string | undefined>): string | undefined {
  const envName = INSTANCE_SETTING_ENV[key as InstanceSettingKey];
  if (!envName) return undefined;
  const value = env[envName];
  return value && value.length > 0 ? value : undefined;
}

/** AES-256-GCM instance settings with env > database > default precedence. */
export class InstanceSettingStore implements EncryptedSettingStore {
  private readonly cache = new Map<string, string>();

  constructor(
    private readonly delegate: InstanceSettingDelegate,
    private readonly env: Record<string, string | undefined> = process.env,
  ) {}

  invalidate(key?: string): void {
    if (key) {
      this.cache.delete(key);
      return;
    }
    this.cache.clear();
  }

  async get(key: string, fallback?: string): Promise<string> {
    const fromEnv = envOverride(key, this.env);
    if (fromEnv !== undefined) return fromEnv;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const row = await this.delegate.findUnique({ where: { key } });
    if (row) {
      const plaintext = decryptAesGcm(row.valueEnc, encryptionSecret(this.env));
      this.cache.set(key, plaintext);
      return plaintext;
    }
    const defaultValue =
      fallback ?? INSTANCE_SETTING_DEFAULTS[key as InstanceSettingKey] ?? '';
    this.cache.set(key, defaultValue);
    return defaultValue;
  }

  async set(key: string, plaintext: string): Promise<void> {
    const valueEnc = encryptAesGcm(plaintext, encryptionSecret(this.env));
    await this.delegate.upsert({
      where: { key },
      create: { key, valueEnc },
      update: { valueEnc },
    });
    this.cache.set(key, plaintext);
  }

  async applyOverridesToEnv(env: Record<string, string | undefined> = this.env): Promise<void> {
    const completed = await this.get('setup.completed');
    if (completed !== 'true') return;
    const rows = await this.delegate.findMany();
    for (const row of rows) {
      const envName = INSTANCE_SETTING_ENV[row.key as InstanceSettingKey];
      if (!envName || env[envName]) continue;
      env[envName] = decryptAesGcm(row.valueEnc, encryptionSecret(env));
    }
    this.copyProviderApiKey(env);
  }

  private copyProviderApiKey(env: Record<string, string | undefined>): void {
    const provider = (env.LLM_GATEWAY || 'ollama').toLowerCase();
    if (provider === 'openai-compatible' && !env.OPENAI_COMPATIBLE_BASE_URL && env.OLLAMA_BASE_URL) {
      env.OPENAI_COMPATIBLE_BASE_URL = env.OLLAMA_BASE_URL;
    }
    const apiKey = env.LLM_API_KEY;
    if (!apiKey) return;
    if (provider === 'openrouter' && !env.OPENROUTER_API_KEY) {
      env.OPENROUTER_API_KEY = apiKey;
    }
    if (provider === 'openai' && !env.OPENAI_API_KEY) {
      env.OPENAI_API_KEY = apiKey;
    }
    if (provider === 'anthropic' && !env.CLAUDE_API_KEY) {
      env.CLAUDE_API_KEY = apiKey;
    }
    if (provider === 'openai-compatible') {
      if (!env.OPENAI_COMPATIBLE_API_KEY) env.OPENAI_COMPATIBLE_API_KEY = apiKey;
      if (!env.OPENAI_COMPATIBLE_BASE_URL && env.OLLAMA_BASE_URL) {
        env.OPENAI_COMPATIBLE_BASE_URL = env.OLLAMA_BASE_URL;
      }
    }
  }
}
