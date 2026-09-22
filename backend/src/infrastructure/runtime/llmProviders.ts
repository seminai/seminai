import { AppError } from '../../domain/errors/AppError';

export const LLM_PROVIDERS = [
  'anthropic',
  'openai',
  'openrouter',
  'ollama',
  'openai-compatible',
] as const;

export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export function parseLlmProvider(value: string | undefined): LlmProvider | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  return (LLM_PROVIDERS as readonly string[]).includes(normalized)
    ? (normalized as LlmProvider)
    : undefined;
}

export function resolveConfiguredLlmProvider(
  env: Readonly<Record<string, string | undefined>> = process.env,
): LlmProvider {
  return parseLlmProvider(env.LLM_GATEWAY) ?? 'ollama';
}

export function assertLlmProvider(value: string | undefined): LlmProvider {
  const parsed = parseLlmProvider(value);
  if (!parsed) {
    throw AppError.badRequest('Unsupported LLM provider', 'INVALID_LLM_PROVIDER');
  }
  return parsed;
}
