import { customFetch } from '@/lib/api-client';

export type SetupLlmProvider = 'ollama' | 'openrouter' | 'openai' | 'anthropic';

export interface OllamaDetectResult {
  readonly reachable: boolean;
  readonly baseUrl: string;
  readonly models: ReadonlyArray<{ readonly name: string }>;
}

export interface CompleteSetupPayload {
  readonly admin: {
    readonly name: string;
    readonly email: string;
    readonly password: string;
  };
  readonly llm: {
    readonly provider: SetupLlmProvider;
    readonly baseUrl?: string;
    readonly model?: string;
    readonly apiKey?: string;
  };
  readonly access: {
    readonly mode: 'lan' | 'public';
  };
  readonly email?: {
    readonly smtpHost?: string;
    readonly user?: string;
    readonly password?: string;
  };
}

export interface CompleteSetupResult {
  readonly token: string;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
    readonly role: string;
  };
}

interface Envelope<T> {
  readonly status: string;
  readonly data: T;
}

export async function detectOllama(): Promise<OllamaDetectResult> {
  const body = await customFetch<Envelope<OllamaDetectResult>>({
    url: '/setup/detect-ollama',
    method: 'GET',
  });
  return body.data;
}

export async function completeSetup(payload: CompleteSetupPayload): Promise<CompleteSetupResult> {
  const body = await customFetch<Envelope<CompleteSetupResult>>({
    url: '/setup/complete',
    method: 'POST',
    data: payload,
  });
  return body.data;
}
