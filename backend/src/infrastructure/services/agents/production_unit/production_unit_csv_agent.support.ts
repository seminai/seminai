import { z } from 'zod';
import { type ExtractionDiagnostics } from '../file_agent/utils/csv_parser';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';


export const usageLogger = LlmUsageLogger.getInstance();


/**
 * Schema for crop identification by LLM
 */
export const CropIdentificationSchema = z.object({
  species: z
    .string()
    .describe(
      'Scientific name of the crop (e.g. "Malus domestica" for apple, "Cucumis melo" for melon)',
    ),
  cropType: z
    .string()
    .describe('Common name/type of the crop in Italian (e.g. "melo", "melone", "frumento tenero")'),
  code: z
    .string()
    .nullable()
    .describe('Optional code identifier following pattern like "MALUS_DOM", "CUCUM_MEL"'),
  variety: z
    .string()
    .nullable()
    .describe('Normalized variety name if provided (e.g. "Granny Smith", "Golden Delicious")'),
});


export type CropIdentification = z.infer<typeof CropIdentificationSchema>;


/**
 * Input for crop identification with optional variety
 */
export interface CropIdentificationInput {
  cropName: string;
  variety: string | null;
}


/**
 * Schema for batch crop identification
 */
export const BatchCropIdentificationSchema = z.object({
  crops: z.array(
    z.object({
      input: z.string().describe('Original input (crop name + variety if present)'),
      species: z.string().describe('Scientific name'),
      cropType: z.string().describe('Common crop type in Italian'),
      code: z.string().nullable().describe('Optional code'),
      variety: z.string().nullable().describe('Normalized variety name'),
    }),
  ),
});


/**
 * Schema for the LLM column mapping response.
 * The LLM analyzes CSV headers and sample rows to determine the column mapping.
 */
export const ColumnMappingSchema = z.object({
  format: z
    .enum(['AGEA', 'LEGACY'])
    .describe(
      'Detected format: AGEA if "Occupazione Suolo Uso Suolo Primario" column exists, otherwise LEGACY',
    ),
  columns: z.object({
    unitName: z
      .string()
      .nullable()
      .describe('Column name for production unit name (e.g. "Unita produttiva")'),
    sezione: z.string().nullable().describe('Column name for cadastral section (e.g. "Sezione")'),
    foglio: z.string().nullable().describe('Column name for cadastral sheet (e.g. "Foglio")'),
    particella: z
      .string()
      .nullable()
      .describe('Column name for cadastral parcel (e.g. "Particella")'),
    subalterno: z
      .string()
      .nullable()
      .describe('Column name for cadastral subaltern (e.g. "Subalterno")'),
    superficieCatastale: z
      .string()
      .nullable()
      .describe('Column name for cadastral area (e.g. "Superficie Catastale")'),
    superficieGrafica: z
      .string()
      .nullable()
      .describe('Column name for graphic area (e.g. "Superficie Grafica")'),
    superficieAgricola: z
      .string()
      .nullable()
      .describe('Column name for agricultural area (e.g. "Superficie Agricola", "SAU")'),
    superficieEleggibile: z
      .string()
      .nullable()
      .describe('Column name for eligible area (e.g. "Superficie Eleggibile")'),
    // Primary cycle columns
    occupazioneSuoloPrimario: z
      .string()
      .nullable()
      .describe(
        'Column name for PRIMARY land occupation/crop (e.g. "Occupazione Suolo Uso Suolo Primario")',
      ),
    destinazioneUsoPrimario: z
      .string()
      .nullable()
      .describe('Column name for PRIMARY use destination (e.g. "Destinazione Uso Suolo Primario")'),
    usoUsoSuoloPrimario: z
      .string()
      .nullable()
      .describe('Column name for PRIMARY use type (e.g. "Uso Uso Suolo Primario")'),
    qualitaUsoSuoloPrimario: z
      .string()
      .nullable()
      .describe('Column name for PRIMARY quality (e.g. "Qualita Uso Suolo Primario")'),
    varietaUsoSuoloPrimario: z
      .string()
      .nullable()
      .describe('Column name for PRIMARY variety (e.g. "Varieta Uso Suolo Primario")'),
    superficieUsoSuoloPrimario: z
      .string()
      .nullable()
      .describe('Column name for primary land use area (e.g. "Superficie Uso Suolo Primario")'),
    superficieNettaUsoSuoloPrimario: z
      .string()
      .nullable()
      .describe(
        'Column name for net primary land use area (e.g. "Superficie Netta Uso Suolo Primario")',
      ),
    tipoSeminaPrimario: z
      .string()
      .nullable()
      .describe('Column name for PRIMARY sowing type (e.g. "Tipo Semina Primario")'),
    dataInizioSeminaPrimario: z
      .string()
      .nullable()
      .describe('Column name for PRIMARY sowing start date (e.g. "Data inizio Semina Primario")'),
    dataFineSeminaPrimario: z
      .string()
      .nullable()
      .describe('Column name for PRIMARY sowing end date (e.g. "Data fine Semina Primario")'),
    // Secondary cycle columns
    occupazioneSuoloSecondario: z
      .string()
      .nullable()
      .describe(
        'Column name for SECONDARY land occupation/crop (e.g. "Occupazione Suolo Uso Suolo Secondario")',
      ),
    destinazioneUsoSecondario: z
      .string()
      .nullable()
      .describe(
        'Column name for SECONDARY use destination (e.g. "Destinazione Uso Suolo Secondario")',
      ),
    varietaUsoSuoloSecondario: z
      .string()
      .nullable()
      .describe('Column name for SECONDARY variety (e.g. "Varieta Uso Suolo Secondario")'),
    superficieUsoSuoloSecondario: z
      .string()
      .nullable()
      .describe('Column name for SECONDARY land use area (e.g. "Superficie Uso Suolo Secondario")'),
    tipoSeminaSecondario: z
      .string()
      .nullable()
      .describe('Column name for SECONDARY sowing type (e.g. "Tipo Semina Secondario")'),
    dataInizioSeminaSecondario: z
      .string()
      .nullable()
      .describe(
        'Column name for SECONDARY sowing start date (e.g. "Data inizio Semina Secondario")',
      ),
    dataFineSeminaSecondario: z
      .string()
      .nullable()
      .describe('Column name for SECONDARY sowing end date (e.g. "Data fine Semina Secondario")'),
    // Common columns
    conduttore: z.string().nullable().describe('Column name for farm operator (e.g. "Conduttore")'),
    aziendaCondAsservimento: z
      .string()
      .nullable()
      .describe('Column name for company (e.g. "Az cond asservimento")'),
    idAppezzamentoAgea: z
      .string()
      .nullable()
      .describe('Column name for AGEA plot ID (e.g. "Id appezzamento AGEA")'),
    rotazioneColturale: z
      .string()
      .nullable()
      .describe('Column name for crop rotation (e.g. "Rotazione colturale")'),
    comuneDescrizione: z
      .string()
      .nullable()
      .describe('Column name for municipality (e.g. "Comune Descrizione")'),
    // Legacy format specific columns
    cropName: z.string().nullable().describe('Column name for crop name in legacy format'),
    cropType: z.string().nullable().describe('Column name for crop type in legacy format'),
    variety: z.string().nullable().describe('Column name for variety in legacy format'),
    protocoll: z.string().nullable().describe('Column name for protocol in legacy format'),
    protectionStructure: z.string().nullable().describe('Column name for protection structure'),
    startDate: z.string().nullable().describe('Column name for start date in legacy format'),
    endDate: z.string().nullable().describe('Column name for end date in legacy format'),
    floweringDate: z.string().nullable().describe('Column name for flowering date'),
    harvestingDate: z.string().nullable().describe('Column name for harvesting date'),
    areaHa: z.string().nullable().describe('Column name for area in hectares'),
    fieldName: z.string().nullable().describe('Column name for field name reference'),
  }),
});


export type ColumnMapping = z.infer<typeof ColumnMappingSchema>;


/**
 * Production cycle extracted from CSV
 */
export interface ProductionCycleRaw {
  cycleIndex: number;
  cropName: string | null;
  cropType: string | null;
  cropCode: string | null;
  variety: string | null;
  occupazione: string | null;
  destinazione: string | null;
  protectionStructure: string | null;
  startDate: string | null;
  endDate: string | null;
  floweringDate: string | null;
  harvestingDate: string | null;
}


/**
 * Raw production unit extracted from CSV
 */
export interface ProductionUnitRaw {
  name: string;
  sezione: string | null;
  foglio: string | null;
  particella: string | null;
  subalterno: string | null;
  areaHa: number | null;
  protocoll: string | null;
  startDate: string | null;
  endDate: string | null;
  cycles: ProductionCycleRaw[];
  allocations: Array<{
    fieldName: string;
    sezione: string | null;
    foglio: string | null;
    particella: string | null;
    subalterno: string | null;
    areaHa: number;
  }>;
}


/**
 * Aggregation key for production units
 * Groups by: occupation + variety + start date + end date
 */
export interface AggregationKey {
  occupazioneNorm: string;
  varietyNorm: string;
  startDate: string;
  endDate: string;
}


/**
 * Result of production unit extraction, including diagnostics
 */
export interface ProductionUnitExtractionResult {
  units: ProductionUnitRaw[];
  diagnostics: ExtractionDiagnostics;
}
