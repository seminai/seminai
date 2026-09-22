import { OpenMeteoService } from '../../../../integrations/open-meteo/OpenMeteoService';

/**
 * Process-wide singleton so the in-memory forecast cache is shared across
 * tool invocations (which are short-lived closures). One instance per process.
 */
export const openMeteoService = new OpenMeteoService();
