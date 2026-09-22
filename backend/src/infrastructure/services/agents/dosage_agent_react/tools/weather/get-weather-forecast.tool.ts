import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { openMeteoService } from './open-meteo-singleton';
import { OPEN_METEO_DISABLED_MESSAGE, isOpenMeteoEnabledForUser } from './require-open-meteo';

const schema = z.object({
  latitude: z.number().min(-90).max(90).describe('Latitudine in gradi decimali (WGS84).'),
  longitude: z.number().min(-180).max(180).describe('Longitudine in gradi decimali (WGS84).'),
  days: z
    .number()
    .int()
    .min(1)
    .max(7)
    .default(3)
    .describe("Giorni di previsione (1-7). Oltre 7 l'accuratezza degrada."),
});

/**
 * Tool: get_weather_forecast
 * Generic Open-Meteo forecast for an arbitrary point. Returns hourly data
 * (temperature, precipitation, probability, wind, gusts, humidity) in the
 * Field's local timezone. Read-only, fail-soft.
 */
export function createGetWeatherForecastTool(userId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'get_weather_forecast',
    description: `Recupera le previsioni meteo orarie da Open-Meteo per una coppia di coordinate.
Restituisce per ogni ora: temperatura (°C), precipitazione (mm), probabilità di pioggia (%), vento e raffiche (km/h), umidità relativa (%). Il timestamp è nel fuso orario locale del punto richiesto.
Usa questo tool quando l'utente chiede previsioni meteo generiche o vuole valutare condizioni in un punto specifico. Per valutare la finestra di applicazione di un trattamento esistente, preferisci 'evaluate_treatment_window'.`,
    schema,
    func: async (args) => {
      const enabled = await isOpenMeteoEnabledForUser(userId);
      if (!enabled) {
        return JSON.stringify({ available: false, reason: OPEN_METEO_DISABLED_MESSAGE });
      }
      const result = await openMeteoService.fetchForecast({
        latitude: args.latitude,
        longitude: args.longitude,
        forecastDays: args.days,
      });
      return JSON.stringify(result);
    },
  });
}
