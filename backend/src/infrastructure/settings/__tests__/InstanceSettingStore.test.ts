import { encryptAesGcm, decryptAesGcm } from '../aesGcm';
import { InstanceSettingStore } from '../InstanceSettingStore';
import type { InstanceSettingDelegate, InstanceSettingRow } from '../encryptedSettingStore';

function memoryDelegate(): InstanceSettingDelegate {
  const rows = new Map<string, InstanceSettingRow>();
  return {
    async findMany() {
      return [...rows.values()];
    },
    async findUnique({ where }) {
      return rows.get(where.key) ?? null;
    },
    async upsert({ where, create, update }) {
      const next = rows.get(where.key)
        ? { key: where.key, valueEnc: update.valueEnc }
        : create;
      rows.set(where.key, next);
      return next;
    },
  };
}

describe('InstanceSettingStore', () => {
  const env: Record<string, string | undefined> = {
    ENCRYPTION_SECRET: 'c'.repeat(64),
  };

  it('encrypts values and prefers env over database', async () => {
    const store = new InstanceSettingStore(memoryDelegate(), env);
    const secret = env.ENCRYPTION_SECRET as string;
    expect(decryptAesGcm(encryptAesGcm('hello', secret), secret)).toBe('hello');

    await store.set('llm.apiKey', '');
    expect(await store.get('llm.apiKey')).toBe('');

    env.LLM_GATEWAY = 'openrouter';
    expect(await store.get('llm.provider')).toBe('openrouter');
  });

  it('applies database values to empty env after setup completes', async () => {
    const isolated: Record<string, string | undefined> = { ENCRYPTION_SECRET: 'd'.repeat(64) };
    const store = new InstanceSettingStore(memoryDelegate(), isolated);
    await store.set('llm.provider', 'ollama');
    await store.set('setup.completed', 'true');
    await store.applyOverridesToEnv(isolated);
    expect(isolated.LLM_GATEWAY).toBe('ollama');
    expect(isolated.SETUP_COMPLETED).toBe('true');
  });
});
