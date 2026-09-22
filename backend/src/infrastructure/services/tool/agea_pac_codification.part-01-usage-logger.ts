import { LlmUsageLogger } from '../llm_costs/llm-usage-logger';
import { z } from 'zod';

export const usageLogger = LlmUsageLogger.getInstance();

/**
 * Schema for PAC code breakdown
 */
export const PacCodeBreakdownSchema = z.object({
  full: z.string().describe('Full PAC code (e.g., "870-011-000-000-000")'),
  gruppo: z.string().describe('Group code (first 3 digits)'),
  gruppoDesc: z.string().describe('Group description in Italian (e.g., "Seminativi")'),
  specie: z.string().describe('Species code (digits 4-6)'),
  specieDesc: z.string().describe('Species description in Italian (e.g., "Orzo")'),
  variante: z.string().describe('Variant code (digits 7-9)'),
  uso: z.string().describe('Use code (digits 10-12)'),
  dettaglio: z.string().describe('Detail code (digits 13-15)'),
});

/**
 * Schema for the LLM response
 */
export const AgeaPacCropResultSchema = z.object({
  species: z.string().describe('Scientific name of the crop (e.g., "Hordeum vulgare" for barley)'),
  cropType: z
    .string()
    .describe('Common name of the crop in Italian (e.g., "Orzo", "Mais", "Soia")'),
  code: z
    .string()
    .nullable()
    .describe('Standardized code following pattern GENUS_SPE (e.g., "HORDE_VUL")'),
  variety: z.string().nullable().describe('Variety name if specified in the variant code'),
  pacCode: PacCodeBreakdownSchema,
  isAgricultural: z
    .boolean()
    .describe('True if this is an agricultural use, false for non-agricultural uses like TARE'),
});

export type AgeaPacCropResult = z.infer<typeof AgeaPacCropResultSchema>;

/**
 * Schema for batch processing
 */
export const BatchAgeaPacResultSchema = z.object({
  results: z.array(AgeaPacCropResultSchema),
});

/**
 * AGEA Crop Entry loaded from CSV
 */
export interface AgeaCropEntry {
  occupationCode: string;
  destinationCode: string;
  useCode: string;
  qualityCode: string;
  varietyName: string;
  varietyCode: string;
  occupationDescription: string;
  destinationDescription: string;
  useDescription: string;
  qualityDescription: string;
}
