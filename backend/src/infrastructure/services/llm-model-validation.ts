export const VALID_CHAT_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4',
  'gpt-3.5-turbo',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'openai/gpt-4-turbo',
  'openai/gpt-4',
  'openai/gpt-3.5-turbo',
  'anthropic/claude-sonnet-4',
  'anthropic/claude-haiku-4.5',
  'claude-sonnet-4-20250514',
  'claude-haiku-4-5-20251001',
] as const;

export type ChatModelName = (typeof VALID_CHAT_MODELS)[number] | (string & Record<string, never>);

export function isValidChatModelName(modelName: string): boolean {
  if (VALID_CHAT_MODELS.includes(modelName as (typeof VALID_CHAT_MODELS)[number])) {
    return true;
  }
  return /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9._:-]*$/i.test(modelName);
}
