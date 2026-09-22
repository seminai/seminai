export interface OllamaModelSummary {
  readonly name: string;
}

export interface OllamaDetectResult {
  readonly reachable: boolean;
  readonly baseUrl: string;
  readonly models: readonly OllamaModelSummary[];
}

const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
const DETECT_TIMEOUT_MS = 1500;

interface OllamaTagsResponse {
  readonly models?: ReadonlyArray<{ readonly name?: string }>;
}

/** Probes a local Ollama daemon without throwing on network failure. */
export async function detectOllama(
  baseUrl = process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<OllamaDetectResult> {
  const normalized = baseUrl.replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DETECT_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${normalized}/api/tags`, { signal: controller.signal });
    if (!response.ok) {
      return { reachable: false, baseUrl: normalized, models: [] };
    }
    const body = (await response.json()) as OllamaTagsResponse;
    const models = (body.models ?? [])
      .map((model) => model.name)
      .filter((name): name is string => Boolean(name))
      .map((name) => ({ name }));
    return { reachable: true, baseUrl: normalized, models };
  } catch {
    return { reachable: false, baseUrl: normalized, models: [] };
  } finally {
    clearTimeout(timer);
  }
}
