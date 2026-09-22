export const INSTANCE_SETTING_KEYS = {
  setupCompleted: 'setup.completed',
  llmProvider: 'llm.provider',
  llmBaseUrl: 'llm.baseUrl',
  llmModel: 'llm.model',
  llmApiKey: 'llm.apiKey',
  accessMode: 'access.mode',
  emailSmtpHost: 'email.smtpHost',
  emailUser: 'email.user',
  emailPassword: 'email.password',
} as const;

export type InstanceSettingKey =
  (typeof INSTANCE_SETTING_KEYS)[keyof typeof INSTANCE_SETTING_KEYS];

export const INSTANCE_SETTING_DEFAULTS: Readonly<Record<InstanceSettingKey, string>> = {
  'setup.completed': 'false',
  'llm.provider': 'ollama',
  'llm.baseUrl': 'http://127.0.0.1:11434',
  'llm.model': 'qwen3.5:4b',
  'llm.apiKey': '',
  'access.mode': 'lan',
  'email.smtpHost': '',
  'email.user': '',
  'email.password': '',
};

export const INSTANCE_SETTING_ENV: Readonly<Record<InstanceSettingKey, string>> = {
  'setup.completed': 'SETUP_COMPLETED',
  'llm.provider': 'LLM_GATEWAY',
  'llm.baseUrl': 'OLLAMA_BASE_URL',
  'llm.model': 'LLM_DEFAULT_MODEL',
  'llm.apiKey': 'LLM_API_KEY',
  'access.mode': 'ACCESS_MODE',
  'email.smtpHost': 'SMTP_HOST',
  'email.user': 'EMAIL_USER',
  'email.password': 'EMAIL_PASSWORD',
};

export function isTruthySetting(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}
