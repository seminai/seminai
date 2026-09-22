import { detectLlmProviders } from '../detectLlmProviders';
import { listLlmModels } from '../listLlmModels';
import { AppError } from '../../../../domain/errors/AppError';

describe('LLM provider catalog', () => {
  it('marks Ollama configured without calling cloud APIs', async () => {
    const fetchImpl = jest.fn(async (url: string | URL) => {
      if (String(url).includes('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'qwen3.5:4b' }] }), { status: 200 });
      }
      throw new Error(`unexpected fetch ${String(url)}`);
    }) as unknown as typeof fetch;
    const result = await detectLlmProviders(
      { LLM_GATEWAY: 'ollama', OPENAI_API_KEY: 'sk-test' },
      fetchImpl,
    );
    expect(result.active).toBe('ollama');
    expect(result.providers.find((item) => item.id === 'ollama')?.reachable).toBe(true);
    expect(result.providers.find((item) => item.id === 'openai')?.configured).toBe(true);
    expect(result.providers.find((item) => item.id === 'openrouter')?.configured).toBe(false);
  });

  it('lists mocked OpenAI models and rejects unknown providers', async () => {
    const fetchImpl = jest.fn(async () => {
      return new Response(JSON.stringify({ data: [{ id: 'gpt-4o-mini' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const listed = await listLlmModels('openai', { OPENAI_API_KEY: 'sk-test' }, fetchImpl);
    expect(listed.models).toEqual([{ id: 'gpt-4o-mini', name: 'gpt-4o-mini' }]);
    await expect(listLlmModels('mistral', {}, fetchImpl)).rejects.toMatchObject({
      code: 'INVALID_LLM_PROVIDER',
    } satisfies Partial<AppError>);
  });
});
