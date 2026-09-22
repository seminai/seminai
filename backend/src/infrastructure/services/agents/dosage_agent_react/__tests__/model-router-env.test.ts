import { resolveModelRoutingFingerprint } from '../../shared/modelRouter';

describe('modelRouter environment routing', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses fast and strong model env vars with OpenRouter', () => {
    process.env.LLM_GATEWAY = 'openrouter';
    process.env.LLM_FAST_MODEL = 'openai/gpt-4o-mini';
    process.env.LLM_DEFAULT_MODEL = 'openai/gpt-4o-mini';
    process.env.LLM_STRONG_MODEL = 'openai/gpt-4o';

    expect(resolveModelRoutingFingerprint()).toEqual({
      provider: 'openrouter',
      low: 'openai/gpt-4o-mini',
      medium: 'openai/gpt-4o-mini',
      high: 'openai/gpt-4o',
    });
  });
});
