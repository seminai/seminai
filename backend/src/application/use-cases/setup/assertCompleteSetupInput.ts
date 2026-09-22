import { AppError } from '../../../domain/errors/AppError';
import type { CompleteSetupInput, SetupLlmProvider } from './setupTypes';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROVIDERS: readonly SetupLlmProvider[] = ['ollama', 'openrouter', 'openai', 'anthropic'];

export function assertCompleteSetupInput(body: CompleteSetupInput): void {
  if (!body.admin?.name?.trim()) {
    throw AppError.badRequest('Admin name is required', 'INVALID_SETUP');
  }
  if (!body.admin.email || !EMAIL_PATTERN.test(body.admin.email)) {
    throw AppError.badRequest('A valid admin email is required', 'INVALID_SETUP');
  }
  if (!body.admin.password || body.admin.password.length < 8) {
    throw AppError.badRequest('Admin password must be at least 8 characters', 'INVALID_SETUP');
  }
  if (!PROVIDERS.includes(body.llm?.provider)) {
    throw AppError.badRequest('Unsupported LLM provider', 'INVALID_SETUP');
  }
  if (body.llm.provider !== 'ollama' && !body.llm.apiKey) {
    throw AppError.badRequest('API key is required for this provider', 'INVALID_SETUP');
  }
  if (body.access?.mode !== 'lan' && body.access?.mode !== 'public') {
    throw AppError.badRequest('Access mode must be lan or public', 'INVALID_SETUP');
  }
}
