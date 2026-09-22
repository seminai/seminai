import { AppError } from '../../../domain/errors/AppError';
import { assertLlmProvider, parseLlmProvider } from '../llmProviders';

describe('llmProviders', () => {
  it('accepts the catalog providers and rejects unknown ids', () => {
    expect(parseLlmProvider('Ollama')).toBe('ollama');
    expect(parseLlmProvider('openai-compatible')).toBe('openai-compatible');
    expect(parseLlmProvider('mistral')).toBeUndefined();
    expect(() => assertLlmProvider('mistral')).toThrow(AppError);
    try {
      assertLlmProvider('mistral');
    } catch (error) {
      expect((error as AppError).code).toBe('INVALID_LLM_PROVIDER');
    }
  });
});
