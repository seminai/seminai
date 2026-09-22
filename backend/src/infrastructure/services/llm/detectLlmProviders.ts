import {
  LLM_PROVIDERS,
  resolveConfiguredLlmProvider,
  type LlmProvider,
} from '../../runtime/llmProviders';
import { detectOllama } from '../../settings/ollamaDetect';

export interface DetectedLlmProvider {
  readonly id: LlmProvider;
  readonly configured: boolean;
  readonly reachable: boolean | null;
}

export interface LlmProviderDetectResult {
  readonly active: LlmProvider;
  readonly providers: readonly DetectedLlmProvider[];
}

export function isProviderConfigured(
  id: LlmProvider,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (id === 'ollama') return true;
  if (id === 'openai') return Boolean(env.OPENAI_API_KEY);
  if (id === 'anthropic') return Boolean(env.CLAUDE_API_KEY || env.ANTHROPIC_API_KEY);
  if (id === 'openrouter') return Boolean(env.OPENROUTER_API_KEY);
  return Boolean(env.OPENAI_COMPATIBLE_BASE_URL || env.OPENAI_BASE_URL);
}

/** Reports which catalog providers are configured. Cloud APIs are never probed. */
export async function detectLlmProviders(
  env: Readonly<Record<string, string | undefined>> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<LlmProviderDetectResult> {
  const ollama = await detectOllama(env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434', fetchImpl);
  const providers = LLM_PROVIDERS.map((id) => {
    const configured = isProviderConfigured(id, env);
    if (id === 'ollama') {
      return { id, configured, reachable: ollama.reachable };
    }
    return { id, configured, reachable: configured ? null : false };
  });
  return { active: resolveConfiguredLlmProvider(env), providers };
}
