import { guardAiClient } from '../guardAiClient';

describe('AI client lifecycle', () => {
  const previous = { ...process.env };
  afterEach(() => {
    process.env = { ...previous };
  });
  test('disabling a provider prevents existing clients and derived bindings from sending requests', () => {
    process.env.AI_ENABLED = 'true';
    const send = jest.fn(() => 'result');
    const guarded = guardAiClient({
      invoke: send,
      bind() {
        return { invoke: () => this.invoke() };
      },
    });
    const bound = guarded.bind();
    expect(bound.invoke()).toBe('result');
    process.env.AI_ENABLED = 'false';
    expect(() => bound.invoke()).toThrow();
    expect(send).toHaveBeenCalledTimes(1);
  });
  test('a provider change invalidates old credentials before another request', () => {
    process.env.AI_ENABLED = 'true';
    process.env.LLM_GATEWAY = 'ollama';
    const send = jest.fn();
    const guarded = guardAiClient({ invoke: send });
    process.env.LLM_GATEWAY = 'openai-compatible';
    expect(() => guarded.invoke()).toThrow('Configurazione modello aggiornata');
    expect(send).not.toHaveBeenCalled();
  });
});
