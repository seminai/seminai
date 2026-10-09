import { getAiCapabilities, isAiEnabled, requireAiEnabled } from '../aiCapabilities';
import { guardAiClient } from '../guardAiClient';
describe('optional AI boundaries', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });
  it('keeps a new offline install disabled and preserves a configured legacy provider', () => {
    expect(isAiEnabled({})).toBe(false);
    expect(isAiEnabled({ LLM_GATEWAY: 'ollama' })).toBe(true);
    expect(isAiEnabled({ LLM_GATEWAY: 'openai', AI_ENABLED: 'false' })).toBe(false);
  });
  it('does not infer image, audio or embeddings capabilities from a chat model', () => {
    expect(getAiCapabilities({ AI_ENABLED: 'true', LLM_DEFAULT_MODEL: 'local-test' })).toEqual({
      enabled: true,
      chat: true,
      vision: false,
      audio: false,
      embeddings: false,
    });
  });
  it('rejects construction and invocation after disabling AI without contacting a provider', () => {
    process.env.AI_ENABLED = 'true';
    const invoke = jest.fn(() => 'unused');
    const client = guardAiClient({ invoke });
    process.env.AI_ENABLED = 'false';
    expect(requireAiEnabled).toThrow();
    expect(() => client.invoke()).toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });
  it('prevents a cached client from using a previous key after a configuration change', () => {
    process.env.AI_ENABLED = 'true';
    const invoke = jest.fn(() => 'unused');
    const client = guardAiClient({ invoke });
    process.env.LLM_DEFAULT_MODEL = 'changed-test-model';
    expect(() => client.invoke()).toThrow('Configurazione modello aggiornata');
    expect(invoke).not.toHaveBeenCalled();
  });
});
