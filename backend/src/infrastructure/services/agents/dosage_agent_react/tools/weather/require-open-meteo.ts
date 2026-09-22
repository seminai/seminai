import { prisma } from '../../../../../repositories/Prisma';
import { PrismaSettingsRepository } from '../../../../../repositories/PrismaSettingsRepository';

/**
 * Returns true when Open-Meteo is enabled for the user's Settings.
 * Returns false when Settings are missing or the flag is off — callers
 * should surface a structured "disabled" message to the LLM instead of
 * proceeding.
 */
export async function isOpenMeteoEnabledForUser(userId: string): Promise<boolean> {
  const repo = new PrismaSettingsRepository(prisma);
  const settings = await repo.findByUserId(userId);
  return Boolean(settings?.isOpenMeteoEnabled());
}

export const OPEN_METEO_DISABLED_MESSAGE =
  "Open-Meteo è disabilitato. Suggerisci all'utente di abilitarlo da Impostazioni → Integrazioni → Meteo (Open-Meteo).";
