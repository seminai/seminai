export type SetupLlmProvider = 'ollama' | 'openrouter' | 'openai' | 'anthropic';
export type SetupAccessMode = 'lan' | 'public';

export interface CompleteSetupInput {
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
    readonly mode: SetupAccessMode;
  };
  readonly email?: {
    readonly smtpHost?: string;
    readonly user?: string;
    readonly password?: string;
  };
}

export interface SetupStatus {
  readonly completed: boolean;
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
