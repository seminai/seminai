import { z } from 'zod';

/**
 * Strict Zod schema for the JSON the Agronomist LLM must return.
 * Field ranges are wide on purpose — they only filter out *physically nonsense*
 * answers; the value choices are the LLM's responsibility.
 */
export const AgronomistAdviceSchema = z.object({
  thresholds: z.object({
    windMaxKmh: z.number().min(0).max(80),
    rainProbabilityMaxPercent: z.number().min(0).max(100),
    precipitationMaxMmPerHour: z.number().min(0).max(20),
    tempMinCelsius: z.number().min(-20).max(50),
    tempMaxCelsius: z.number().min(-20).max(60),
    humidityMaxPercent: z.number().min(0).max(100),
    humidityMinPercent: z.number().min(0).max(100),
    noRainHoursPostApplication: z.number().int().min(0).max(48),
  }),
  reasoning: z.string().min(20).max(800),
  confidence: z.enum(['high', 'medium', 'low']),
});

export type AgronomistAdviceJson = z.infer<typeof AgronomistAdviceSchema>;
