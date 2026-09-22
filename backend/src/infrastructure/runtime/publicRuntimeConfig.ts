import { resolveAppMode } from './resolveAppMode';
import { resolveAccessMode, resolvePublicBaseUrl } from './resolvePublicBaseUrl';
import { resolveTunnelHealth } from './tunnelHealth';

export interface PublicRuntimeConfig {
  readonly appMode: 'all' | 'api' | 'worker';
  readonly storageDriver: string;
  readonly setupCompleted: boolean;
  readonly llmProvider: string | null;
  readonly accessMode: string;
  readonly publicBaseUrl: string;
  readonly inviteRequired: boolean;
  readonly tunnelProvider: string;
  readonly features: {
    readonly qdrant: boolean;
    readonly ocr: boolean;
    readonly tavily: boolean;
    readonly googleLogin: boolean;
    readonly email: boolean;
  };
}

/** Builds the unauthenticated capability payload for GET /config/public. */
export function buildPublicRuntimeConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): PublicRuntimeConfig {
  const hasSmtp = Boolean(env.SMTP_HOST || (env.EMAIL_USER && env.EMAIL_PASSWORD));
  const tunnel = resolveTunnelHealth(env);
  return {
    appMode: resolveAppMode(env.APP_MODE),
    storageDriver: env.STORAGE_DRIVER || 'local',
    setupCompleted: env.SETUP_COMPLETED === 'true',
    llmProvider: env.LLM_GATEWAY || null,
    accessMode: resolveAccessMode(env),
    publicBaseUrl: resolvePublicBaseUrl(env),
    inviteRequired: true,
    tunnelProvider: tunnel.provider,
    features: {
      qdrant: Boolean(env.QDRANT_URL),
      ocr: Boolean(env.OCR_PROVIDER || env.MISTRAL_API_KEY),
      tavily: Boolean(env.TAVILY_API_KEY),
      googleLogin: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      email: hasSmtp,
    },
  };
}
