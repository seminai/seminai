import { detectOllama } from '../ollamaDetect';

describe('detectOllama', () => {
  it('returns reachable models from /api/tags', async () => {
    const result = await detectOllama('http://ollama.local', async () => {
      return new Response(JSON.stringify({ models: [{ name: 'qwen3.5:4b' }] }), { status: 200 });
    });
    expect(result.reachable).toBe(true);
    expect(result.models).toEqual([{ name: 'qwen3.5:4b' }]);
  });

  it('returns unreachable when the probe fails', async () => {
    const result = await detectOllama('http://ollama.local', async () => {
      throw new Error('offline');
    });
    expect(result.reachable).toBe(false);
    expect(result.models).toEqual([]);
  });
});
