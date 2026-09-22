import { z } from 'zod';
import { type ExtractionDiagnostics } from './utils/csv_parser';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';


export const usageLogger = LlmUsageLogger.getInstance();


/**
 * Schema for the LLM column mapping response.
 * The LLM analyzes CSV headers and sample rows to determine the column mapping.
 */
export const FieldColumnMappingSchema = z.object({
  columns: z.object({
    // Identificativi
    unitaProduttiva: z
      .string()
      .nullable()
      .describe(
        'Column name for unit/company name (e.g. "Ragione Sociale", "Unita Produttiva", "Azienda")',
      ),
    // Ubicazione
    regione: z.string().nullable().describe('Column name for region (e.g. "Regione")'),
    provincia: z.string().nullable().describe('Column name for province (e.g. "Provincia")'),
    comune: z.string().nullable().describe('Column name for municipality (e.g. "Comune")'),
    cap: z.string().nullable().describe('Column name for postal code (e.g. "CAP")'),
    indirizzo: z.string().nullable().describe('Column name for address (e.g. "Indirizzo", "Via")'),
    // Dati catastali
    sezione: z
      .string()
      .nullable()
      .describe('Column name for cadastral section (e.g. "Sezione", "Sez.")'),
    foglio: z
      .string()
      .nullable()
      .describe('Column name for cadastral sheet (e.g. "Foglio", "Foglio ", "Fgl.")'),
    particella: z
      .string()
      .nullable()
      .describe('Column name for cadastral parcel (e.g. "Particella", "Part.")'),
    subalterno: z
      .string()
      .nullable()
      .describe('Column name for cadastral subaltern (e.g. "Subalterno", "Sub.")'),
    // Superfici
    superficieCatastale: z
      .string()
      .nullable()
      .describe(
        'Column name for cadastral area (e.g. "Superficie Catastale", "Sup. Cat.", "SUPERFICIE(ha)")',
      ),
    superficieGrafica: z
      .string()
      .nullable()
      .describe('Column name for graphic area (e.g. "Superficie Grafica", "Sup. Graf.")'),
    sau: z
      .string()
      .nullable()
      .describe('Column name for agricultural area (e.g. "SAU", "Superficie Agricola")'),
    // Uso del suolo
    usoSuolo: z
      .string()
      .nullable()
      .describe('Column name for land use (e.g. "Occupazione Suolo", "Uso", "Coltura", "Qualita")'),
    qualita: z.string().nullable().describe('Column name for quality (e.g. "Qualita", "Qualità")'),
    // Date
    dataInizio: z
      .string()
      .nullable()
      .describe('Column name for start date (e.g. "Data Inizio Utilizzo", "Inizio Conduzione")'),
    dataFine: z
      .string()
      .nullable()
      .describe('Column name for end date (e.g. "Data Fine Utilizzo", "Fine Conduzione")'),
  }),
  // Metadata rilevata
  superficieUnit: z
    .enum(['HA', 'MQ', 'UNKNOWN'])
    .describe('Unit of measurement for area columns: HA (hectares), MQ (square meters), UNKNOWN'),
  dateFormat: z
    .enum(['DD/MM/YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD', 'UNKNOWN'])
    .describe('Date format detected in the CSV'),
});


export type FieldColumnMapping = z.infer<typeof FieldColumnMappingSchema>;


/**
 * Schema per l'output dei Field estratti
 */
export const FieldOutputSchema = z.object({
  fields: z
    .array(
      z.object({
        name: z
          .string()
          .describe('Nome campo derivato da unità produttiva + identificativo catastale'),
        nation: z.string().nullable(),
        region: z.string().nullable(),
        city: z.string().nullable(),
        address: z.string().nullable(),
        cap: z.string().nullable(),
        foglio: z.string().describe('Numero Foglio catastale'),
        particella: z.string().describe('Numero Particella'),
        subalterno: z.string().nullable(),
        sezione: z.string().nullable().describe('Sezione catastale'),
        superficieCatastaleMq: z.number().nullable().describe('Superficie Catastale in MQ'),
        gisHa: z.number().nullable().describe('Superficie Grafica in ettari'),
        sauHa: z.number().nullable().describe('SAU in ettari'),
        variazioneMq: z.string().nullable(),
        uso: z.string().nullable().describe('Uso del suolo primario'),
        qualita: z.string().nullable(),
        soilType: z.string().nullable(),
        ph: z.number().nullable(),
        nitrogen: z.number().nullable(),
        phosphorus: z.number().nullable(),
        potassium: z.number().nullable(),
        calcium: z.number().nullable(),
        magnesium: z.number().nullable(),
        latitude: z.number().nullable(),
        longitude: z.number().nullable(),
        inizioConduzione: z
          .string()
          .nullable()
          .describe('Data inizio conduzione formato YYYY-MM-DD'),
        fineConduzione: z.string().nullable().describe('Data fine conduzione formato YYYY-MM-DD'),
      }),
    )
    .describe('Lista campi agricoli estratti aggregati per particella'),
});


export type ExtractedFieldData = {
  fields: z.infer<typeof FieldOutputSchema>['fields'];
  diagnostics?: ExtractionDiagnostics;
};

export type FieldRecord = z.infer<typeof FieldOutputSchema>['fields'][number];


export interface AggregatedField {
  unitaProduttiva: string;
  regione: string | null;
  provincia: string | null;
  comune: string;
  indirizzo: string | null;
  cap: string | null;
  sezione: string | null;
  foglio: string;
  particella: string;
  subalterno: string | null;
  superficieCatastaleHa: number | null;
  superficieGraficaHa: number | null;
  sauHa: number | null;
  usiSuolo: string[];
  qualita: string | null;
  dateInizio: string[];
  dateFine: string[];
}
