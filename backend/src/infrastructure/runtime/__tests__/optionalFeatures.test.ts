import { AppError } from '../../../domain/errors/AppError';
import { GoogleLoginUseCase } from '../../../application/use-cases/auth/GoogleLoginUseCase';
import type { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { createTavilySearchTool } from '../../services/agents/job_agent/tools.part-01-create-tavily-search-tool';
import { resolveQdrantConnectionConfig } from '../../services/qdrant-config';
import { requireConfiguredFeature } from '../requireConfiguredFeature';
import { buildPublicRuntimeConfig } from '../publicRuntimeConfig';

describe('optional local-first features', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env.GOOGLE_CLIENT_ID = originalEnv.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = originalEnv.GOOGLE_CLIENT_SECRET;
    process.env.TAVILY_API_KEY = originalEnv.TAVILY_API_KEY;
    process.env.QDRANT_URL = originalEnv.QDRANT_URL;
    process.env.MISTRAL_API_KEY = originalEnv.MISTRAL_API_KEY;
    process.env.SMTP_HOST = originalEnv.SMTP_HOST;
    if (!originalEnv.GOOGLE_CLIENT_ID) delete process.env.GOOGLE_CLIENT_ID;
    if (!originalEnv.TAVILY_API_KEY) delete process.env.TAVILY_API_KEY;
    if (!originalEnv.QDRANT_URL) delete process.env.QDRANT_URL;
  });

  it('constructs Google login without crashing and fails at execute', async () => {
    process.env.GOOGLE_CLIENT_ID = '';
    const useCase = new GoogleLoginUseCase({} as IUserRepository);
    await expect(useCase.execute({ idToken: 'token' })).rejects.toMatchObject({
      statusCode: 503,
      code: 'feature_not_configured',
    } satisfies Partial<AppError>);
  });

  it('returns feature_not_configured for Qdrant and Tavily', () => {
    process.env.QDRANT_URL = '';
    process.env.TAVILY_API_KEY = '';
    expect(() => resolveQdrantConnectionConfig()).toThrow(AppError);
    expect(() => createTavilySearchTool()).toThrow(AppError);
    try {
      requireConfiguredFeature('OCR', undefined);
    } catch (error) {
      expect((error as AppError).code).toBe('feature_not_configured');
      expect((error as AppError).statusCode).toBe(503);
    }
  });

  it('exposes disabled features on the public config payload', () => {
    const config = buildPublicRuntimeConfig({
      APP_MODE: 'all',
      STORAGE_DRIVER: 'local',
    });
    expect(config.setupCompleted).toBe(false);
    expect(config.llmProvider).toBeNull();
    expect(config.accessMode).toBe('lan');
    expect(config.inviteRequired).toBe(true);
    expect(config.tunnelProvider).toBe('none');
    expect(config.features).toEqual({
      qdrant: false,
      ocr: false,
      tavily: false,
      googleLogin: false,
      email: false,
    });
  });
});
