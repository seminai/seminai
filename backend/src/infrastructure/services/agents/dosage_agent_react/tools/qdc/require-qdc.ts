import { prisma } from '../../../../../repositories/Prisma';
import { PrismaSettingsRepository } from '../../../../../repositories/PrismaSettingsRepository';

/**
 * Resolves the QDC OAuth client ID (the Image Line "CODICE CLIENTE").
 * The service-level env var IMAGE_LINE_CLIENT_ID wins; the per-user
 * Settings.qdcApiKey is kept as a legacy fallback. Returns null when the
 * integration is not configured — callers should surface a structured
 * "not configured" message to the LLM instead of proceeding.
 * NOTE: IMAGE_LINE_API_KEY (the service secret key) is NOT part of the QDC v2
 * "integrazioni" auth flow, which only needs the client_id.
 */
export async function getQdcClientIdForUser(userId: string): Promise<string | null> {
  const envClientId = process.env.IMAGE_LINE_CLIENT_ID?.trim();
  if (envClientId) {
    return envClientId;
  }
  const repo = new PrismaSettingsRepository(prisma);
  const settings = await repo.findByUserId(userId);
  return settings?.hasQdcApiKey() ? settings.qdcApiKey : null;
}

export const QDC_DISABLED_MESSAGE =
  'QDC (Quaderno di Campagna) non è configurato: manca IMAGE_LINE_CLIENT_ID lato server e nessuna chiave è salvata in Impostazioni → Integrazioni → QDC API Key.';

/** Normalizes any thrown value into a short human-readable message. */
export function describeQdcError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
