import { AppError } from '../../../domain/errors/AppError';
import { assertLlmProvider, resolveConfiguredLlmProvider, type LlmProvider } from '../../runtime/llmProviders';
import { detectOllama } from '../../settings/ollamaDetect';

export interface LlmModelSummary {
  readonly id: string;
  readonly name: string;
}

export interface LlmModelListResult {
  readonly provider: LlmProvider;
  readonly models: readonly LlmModelSummary[];
}

type FetchImpl = typeof fetch;

interface OpenAiModelsBody {
  readonly data?: ReadonlyArray<{ readonly id?: string }>;
}

function toSummaries(ids: readonly string[]): LlmModelSummary[] {
  return ids.filter(Boolean).map((id) => ({ id, name: id }));
}

async function readJson(response: Response): Promise<OpenAiModelsBody> {
  return (await response.json()) as OpenAiModelsBody;
}

async function listOpenAiCompatible(
  url: string,
  headers: Record<string, string>,
  fetchImpl: FetchImpl,
): Promise<LlmModelSummary[]> {
  const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(5_000) });
  if (!response.ok) {
    throw AppError.badRequest(`Provider catalog returned HTTP ${response.status}`, 'LLM_CATALOG_UNAVAILABLE');
  }
  const body = await readJson(response);
  const ids = (body.data ?? []).map((entry) => entry.id).filter((id): id is string => Boolean(id));
  return toSummaries(ids);
}

async function listForProvider(
  provider: LlmProvider,
  env: Readonly<Record<string, string | undefined>>,
  fetchImpl: FetchImpl,
): Promise<LlmModelSummary[]> {
  if (provider === 'ollama') {
    const detected = await detectOllama(env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434', fetchImpl);
    return detected.models.map((model) => ({ id: model.name, name: model.name }));
  }
  if (provider === 'openai') {
    const key = env.OPENAI_API_KEY;
    if (!key) return [];
    return listOpenAiCompatible('https://api.openai.com/v1/models', { authorization: `Bearer ${key}` }, fetchImpl);
  }
  if (provider === 'openrouter') {
    const key = env.OPENROUTER_API_KEY;
    if (!key) return [];
    return listOpenAiCompatible(
      'https://openrouter.ai/api/v1/models',
      { authorization: `Bearer ${key}` },
      fetchImpl,
    );
  }
  if (provider === 'anthropic') {
    const key = env.CLAUDE_API_KEY || env.ANTHROPIC_API_KEY;
    if (!key) return [];
    return listOpenAiCompatible(
      'https://api.anthropic.com/v1/models',
      { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      fetchImpl,
    );
  }
  const base = (env.OPENAI_COMPATIBLE_BASE_URL || env.OPENAI_BASE_URL || '').replace(/\/$/, '');
  if (!base) return [];
  const key = env.OPENAI_COMPATIBLE_API_KEY || env.OPENAI_API_KEY || 'local';
  return listOpenAiCompatible(`${base}/models`, { authorization: `Bearer ${key}` }, fetchImpl);
}

/** Lists models for a catalog provider. Callers inject fetch so cloud tests stay offline. */
export async function listLlmModels(
  providerValue: string | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
  fetchImpl: FetchImpl = fetch,
): Promise<LlmModelListResult> {
  const provider = providerValue ? assertLlmProvider(providerValue) : resolveConfiguredLlmProvider(env);
  try {
    const models = await listForProvider(provider, env, fetchImpl);
    return { provider, models };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.badRequest('Provider catalog is unavailable', 'LLM_CATALOG_UNAVAILABLE');
  }
}
