import { createChatModel } from '../infrastructure/services/llm-model-factory';
import {
  hasChatLlmApiKey,
  hasClaudeApiKey,
  resolveChatModelConfig,
  resolveChatModelName,
} from '../infrastructure/services/llm-config';

describe('llm-config Claude native support', () => {
  const previousGateway = process.env.LLM_GATEWAY;
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousClaudeKey = process.env.CLAUDE_API_KEY;
  const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
  const previousCompatibleUrl = process.env.OPENAI_COMPATIBLE_BASE_URL;

  afterEach(() => {
    process.env.LLM_GATEWAY = previousGateway;
    process.env.OPENAI_API_KEY = previousOpenAiKey;
    process.env.CLAUDE_API_KEY = previousClaudeKey;
    process.env.OPENROUTER_API_KEY = previousOpenRouterKey;
    if (previousCompatibleUrl === undefined) delete process.env.OPENAI_COMPATIBLE_BASE_URL;
    else process.env.OPENAI_COMPATIBLE_BASE_URL = previousCompatibleUrl;
  });

  it('normalizes OpenRouter Claude model names for native Anthropic API', () => {
    process.env.LLM_GATEWAY = 'openai';
    expect(resolveChatModelName('anthropic/claude-haiku-4.5', 'openai')).toBe(
      'claude-haiku-4-5-20251001',
    );
    expect(resolveChatModelName('openai/gpt-4o-mini', 'openai')).toBe('gpt-4o-mini');
  });

  it('resolves Claude config with CLAUDE_API_KEY when gateway is openai', () => {
    process.env.LLM_GATEWAY = 'openai';
    process.env.CLAUDE_API_KEY = 'claude-test-key';
    process.env.OPENAI_API_KEY = 'openai-test-key';
    const config = resolveChatModelConfig('anthropic/claude-haiku-4.5');
    expect(config.provider).toBe('claude');
    expect(config.modelName).toBe('claude-haiku-4-5-20251001');
    expect(config.apiKey).toBe('claude-test-key');
    expect(config.gateway).toBe('openai');
  });

  it('resolves OpenAI config with OPENAI_API_KEY when gateway is openai', () => {
    process.env.LLM_GATEWAY = 'openai';
    process.env.CLAUDE_API_KEY = 'claude-test-key';
    process.env.OPENAI_API_KEY = 'openai-test-key';
    const config = resolveChatModelConfig('gpt-4o-mini');
    expect(config.provider).toBe('openai');
    expect(config.modelName).toBe('gpt-4o-mini');
    expect(config.apiKey).toBe('openai-test-key');
  });

  it('keeps OpenRouter provider and key when gateway is openrouter', () => {
    process.env.LLM_GATEWAY = 'openrouter';
    process.env.OPENROUTER_API_KEY = 'openrouter-test-key';
    process.env.CLAUDE_API_KEY = 'claude-test-key';
    const config = resolveChatModelConfig('anthropic/claude-haiku-4.5');
    expect(config.provider).toBe('openrouter');
    expect(config.apiKey).toBe('openrouter-test-key');
    expect(config.modelName).toBe('anthropic/claude-haiku-4.5');
  });

  it('treats chat as available with only CLAUDE_API_KEY on openai gateway', () => {
    process.env.LLM_GATEWAY = 'openai';
    delete process.env.OPENAI_API_KEY;
    process.env.CLAUDE_API_KEY = 'claude-test-key';
    expect(hasClaudeApiKey()).toBe(true);
    expect(hasChatLlmApiKey()).toBe(true);
  });

  it('creates chat model metadata with Claude provider for native Anthropic models', () => {
    process.env.LLM_GATEWAY = 'openai';
    process.env.CLAUDE_API_KEY = 'claude-test-key';
    process.env.OPENAI_API_KEY = 'openai-test-key';
    const created = createChatModel({ modelName: 'anthropic/claude-haiku-4.5', temperature: 0 });
    expect(created.provider).toBe('claude');
    expect(created.modelName).toBe('claude-haiku-4-5-20251001');
    expect(created.gateway).toBe('openai');
  });

  it('treats Ollama as a local OpenAI-compatible chat gateway', () => {
    process.env.LLM_GATEWAY = 'ollama';
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    expect(hasChatLlmApiKey()).toBe(true);
    const config = resolveChatModelConfig('qwen3.5:4b');
    expect(config.gateway).toBe('openai');
    expect(config.baseUrl).toContain('11434');
    expect(config.modelName).toBe('qwen3.5:4b');
  });

  it('resolves Anthropic as a first-class gateway', () => {
    process.env.LLM_GATEWAY = 'anthropic';
    process.env.CLAUDE_API_KEY = 'claude-test-key';
    const config = resolveChatModelConfig('claude-sonnet-4-20250514');
    expect(config.provider).toBe('claude');
    expect(config.apiKey).toBe('claude-test-key');
  });

  it('resolves openai-compatible base URLs without a cloud key', () => {
    process.env.LLM_GATEWAY = 'openai-compatible';
    process.env.OPENAI_COMPATIBLE_BASE_URL = 'http://127.0.0.1:8080/v1';
    delete process.env.OPENAI_API_KEY;
    expect(hasChatLlmApiKey()).toBe(true);
    const config = resolveChatModelConfig('local-model');
    expect(config.baseUrl).toBe('http://127.0.0.1:8080/v1');
    expect(config.provider).toBe('openai');
  });
});
