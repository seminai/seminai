import type { SetupLlmProvider } from '@/lib/setup-api';

export interface SetupDraft {
  name: string;
  email: string;
  password: string;
  provider: SetupLlmProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
  accessMode: 'lan' | 'public';
  smtpHost: string;
  smtpUser: string;
  smtpPassword: string;
}

export const INITIAL_SETUP_DRAFT: SetupDraft = {
  name: '',
  email: '',
  password: '',
  provider: 'ollama',
  baseUrl: 'http://127.0.0.1:11434',
  model: 'qwen3.5:4b',
  apiKey: '',
  accessMode: 'lan',
  smtpHost: '',
  smtpUser: '',
  smtpPassword: '',
};
