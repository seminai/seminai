import { z } from 'zod';
import type { ChatOpenAI } from '@langchain/openai';
import {
  type ParsedRow,
  type ExtractionDiagnostics,
  createDiagnostics,
  bufferToCsv,
  parseCsv as sharedParseCsv,
  getValue as sharedGetValue,
  parseNumber as sharedParseNumber,
  normalizeString as sharedNormalizeString,
  validateColumnMapping,
  invokeLLMWithRetry,
} from './utils/csv_parser';
import {
  isLombardiaFormat,
  LOMBARDIA_COLUMN_MAPPING,
  parseUsoSuoloFromTipoUtilizzo,
  parseLombardiaDate,
  getRegioneFromProvincia,
} from './template/lombardia_file_structure';
import { createChatModel } from '../../llm-model-factory';
import {
  isEmiliaRomagnaFormat,
  EMILIA_ROMAGNA_COLUMN_MAPPING,
  parseUsoSuoloFromOccupazione,
  parseEmiliaRomagnaDate,
  parseEmiliaRomagnaSuperficie,
  isNonAgriculturalUse as isEmiliaRomagnaNonAgricultural,
  isSauRow,
  normalizeRegione,
} from './template/emilia_romagna_file_structure';
import {
  isPiemonteFormat,
  PIEMONTE_COLUMN_MAPPING,
  parseUsoSuoloFromOccupazione as parsePiemonteUsoSuolo,
  parsePiemonteDate,
  parsePiemonteSuperficie,
  parseComuneDescrizione,
  parseUnitaProduttiva,
  isNonAgriculturalUse as isPiemonteNonAgricultural,
  getRegioneFromProvincia as getPiemonteRegione,
  getRegioneFromComune,
} from './template/piemonte_file_structure';
import {
  isVenetoFormat,
  VENETO_COLUMN_MAPPING,
  parseUsoSuoloFromOccupazione as parseVenetoUsoSuolo,
  parseVenetoDate,
  parseVenetoSuperficie,
  parseComuneDescrizione as parseVenetoComuneDescrizione,
  parseUnitaProduttiva as parseVenetoUnitaProduttiva,
  isNonAgriculturalUse as isVenetoNonAgricultural,
  getRegioneFromProvincia as getVenetoRegione,
  getRegioneFromComune as getVenetoRegioneFromComune,
  // AVEPA Piano Utilizzo format
  isVenetoAVEPAFormat,
  parsePrimaColturaColumn,
} from './template/veneto_file_structure';
import {
  isCiaSchedarioViticoloFormat,
  CIA_SCHEDARIO_VITICOLO_COLUMN_MAPPING,
  parseCiaNumber,
  getRegioneFromProvincia as getCiaRegione,
  normalizeVitignoName,
} from './template/cia_schedario_viticolo_file_structure';
import { detectAndExtractHeaders, convertToParseResult } from './utils/header_detector';
import { LlmJobType } from '@prisma/client';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';

const usageLogger = LlmUsageLogger.getInstance();

/**
 * Schema for the LLM column mapping response.
 * The LLM analyzes CSV headers and sample rows to determine the column mapping.
 */
const FieldColumnMappingSchema = z.object({
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

type FieldColumnMapping = z.infer<typeof FieldColumnMappingSchema>;

/**
 * Schema per l'output dei Field estratti
 */
const FieldOutputSchema = z.object({
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
type FieldRecord = z.infer<typeof FieldOutputSchema>['fields'][number];

interface AggregatedField {
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

/**
 * Agent for extracting Field data from CSV/Excel files.
 * Uses a two-phase approach:
 * 1. LLM phase: Analyze headers and sample rows to determine column mapping
 * 2. Deterministic phase: Parse all rows using the mapping, aggregate by particella
 */
export class FieldCsvAgent {
  private model: ChatOpenAI | null = null;

  /**
   * Extract fields from CSV/Excel buffer
   */
  async extractFieldsFromCsv(fileBuffer: Buffer): Promise<ExtractedFieldData> {
    // Step 0: Try advanced header detection for complex files (multi-row headers, offset rows)
    const detection = detectAndExtractHeaders(fileBuffer);

    // If we detected a known format with the advanced detector, use it
    if (detection.detectedFormat !== 'unknown' && detection.headers.length > 0) {
      console.log(
        `FieldCsvAgent: Advanced detection found ${detection.detectedFormat} format ` +
          `(headers at row ${detection.headerStartRow}, ${detection.headerRowCount} header rows, ` +
          `${detection.rawRows.length} data rows)`,
      );

      const { rows } = convertToParseResult(detection);

      if (rows.length === 0) {
        throw new Error('Nessuna riga dati trovata nel file');
      }

      // Use the appropriate regional parser based on detected format
      if (detection.detectedFormat === 'lombardia') {
        console.log('FieldCsvAgent: Using Lombardia format parser (advanced detection)');
        return this.extractFieldsLombardiaFormat(rows);
      }

      if (detection.detectedFormat === 'emilia_romagna') {
        console.log('FieldCsvAgent: Using Emilia-Romagna format parser (advanced detection)');
        return this.extractFieldsEmiliaRomagnaFormat(rows);
      }

      if (detection.detectedFormat === 'piemonte') {
        console.log('FieldCsvAgent: Using Piemonte format parser (advanced detection)');
        return this.extractFieldsPiemonteFormat(rows);
      }

      if (detection.detectedFormat === 'veneto') {
        console.log('FieldCsvAgent: Using Veneto format parser (advanced detection)');
        return this.extractFieldsVenetoFormat(rows);
      }

      if (detection.detectedFormat === 'veneto_avepa') {
        console.log(
          'FieldCsvAgent: Using Veneto AVEPA Piano Utilizzo format parser (advanced detection)',
        );
        return this.extractFieldsVenetoAVEPAFormat(rows, detection.headers);
      }

      if (detection.detectedFormat === 'cia_schedario_viticolo') {
        console.log(
          'FieldCsvAgent: Using CIA Schedario Viticolo format parser (advanced detection)',
        );
        return this.extractFieldsCiaSchedarioViticoloFormat(rows);
      }
    }

    // Fallback to original parsing for simple CSV files
    const csvContent = this.bufferToCsv(fileBuffer);

    if (!csvContent.trim()) {
      throw new Error('File CSV vuoto');
    }

    // Step 1: Parse CSV into headers and rows
    const { headers, rows } = this.parseCsv(csvContent);
    console.log(`FieldCsvAgent: Parsed ${rows.length} rows with ${headers.length} columns`);

    if (rows.length === 0) {
      throw new Error('Nessuna riga dati trovata nel CSV');
    }

    // Step 1.5: Check for known regional formats (no LLM needed)
    if (isLombardiaFormat(headers)) {
      console.log('FieldCsvAgent: Detected Lombardia format, using deterministic parser');
      return this.extractFieldsLombardiaFormat(rows);
    }

    if (isEmiliaRomagnaFormat(headers)) {
      console.log('FieldCsvAgent: Detected Emilia-Romagna format, using deterministic parser');
      return this.extractFieldsEmiliaRomagnaFormat(rows);
    }

    if (isPiemonteFormat(headers)) {
      console.log('FieldCsvAgent: Detected Piemonte format, using deterministic parser');
      return this.extractFieldsPiemonteFormat(rows);
    }

    if (isVenetoFormat(headers)) {
      console.log('FieldCsvAgent: Detected Veneto format, using deterministic parser');
      return this.extractFieldsVenetoFormat(rows);
    }

    if (isVenetoAVEPAFormat(headers)) {
      console.log('FieldCsvAgent: Detected Veneto AVEPA format, using deterministic parser');
      return this.extractFieldsVenetoAVEPAFormat(rows, headers);
    }

    if (isCiaSchedarioViticoloFormat(headers)) {
      console.log(
        'FieldCsvAgent: Detected CIA Schedario Viticolo format, using deterministic parser',
      );
      return this.extractFieldsCiaSchedarioViticoloFormat(rows);
    }

    const compactSataMapping = this.getCompactSataMapping(headers);
    if (compactSataMapping) {
      console.log('FieldCsvAgent: Detected compact SATA format, using deterministic parser');
      const diagnostics = createDiagnostics(rows.length, 'SATA_COMPACT');
      const parsedRows = this.extractRowsWithMapping(rows, compactSataMapping);
      const aggregatedFields = this.aggregateByParticella(parsedRows, compactSataMapping);
      const fields = this.convertToOutputFormat(aggregatedFields, compactSataMapping);
      diagnostics.extractedRows = fields.length;
      const skippedCount = rows.length - parsedRows.length;
      if (skippedCount > 0) {
        diagnostics.skippedRows.push({
          reason: 'Foglio o Particella mancante',
          count: skippedCount,
        });
      }
      return { fields, diagnostics };
    }

    // Step 2: Get column mapping from LLM (only headers + first 10 sample rows)
    const rawMapping = await this.getColumnMapping(headers, rows.slice(0, 10));
    const mapping = this.adjustAreaUnitBySample(rows, rawMapping);

    // Step 2.5: Validate LLM column mapping against actual headers
    const { columns: validatedColumns, warnings: mappingWarnings } = validateColumnMapping(
      mapping.columns,
      headers,
    );
    mapping.columns = validatedColumns as typeof mapping.columns;
    if (mappingWarnings.length > 0) {
      console.warn(`FieldCsvAgent: Column mapping warnings:`, mappingWarnings);
    }
    console.log(`FieldCsvAgent: Column mapping detected`, mapping.columns);

    const diagnostics = createDiagnostics(rows.length, 'LLM_MAPPED');
    diagnostics.warnings.push(...mappingWarnings);

    // Step 3: Try deterministic parsing first
    try {
      const parsedRows = this.extractRowsWithMapping(rows, mapping);
      console.log(`FieldCsvAgent: Extracted ${parsedRows.length} valid rows`);

      // Step 4: Aggregate by particella
      const aggregatedFields = this.aggregateByParticella(parsedRows, mapping);
      console.log(`FieldCsvAgent: Aggregated to ${aggregatedFields.length} fields`);

      if (aggregatedFields.length > 0) {
        // Step 5: Convert to output format
        const fields = this.convertToOutputFormat(aggregatedFields, mapping);
        diagnostics.extractedRows = fields.length;
        const skippedCount = rows.length - parsedRows.length;
        if (skippedCount > 0) {
          diagnostics.skippedRows.push({
            reason: 'Foglio o Particella mancante',
            count: skippedCount,
          });
        }
        return { fields, diagnostics };
      }
    } catch (error) {
      console.warn(
        `FieldCsvAgent: Deterministic parsing failed: ${error instanceof Error ? error.message : String(error)}. Falling back to LLM extraction.`,
      );
      diagnostics.warnings.push(
        `Parsing deterministico fallito: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Fallback: Use LLM for full extraction if deterministic parsing fails
    console.log('FieldCsvAgent: Using LLM fallback for field extraction');
    diagnostics.detectedFormat = 'LLM_FULL_EXTRACTION';
    const llmResult = await this.extractFieldsWithLLM(csvContent);
    diagnostics.extractedRows = llmResult.fields.length;
    return { ...llmResult, diagnostics };
  }

  private adjustAreaUnitBySample(
    rows: ParsedRow[],
    mapping: FieldColumnMapping,
  ): FieldColumnMapping {
    const areaColumnName = mapping.columns.superficieCatastale;
    if (!areaColumnName) {
      return mapping;
    }
    const samples: number[] = [];
    for (let i = 0; i < rows.length && samples.length < 50; i++) {
      const raw = this.getValue(rows[i], areaColumnName);
      const parsed = this.parseNumber(raw);
      if (parsed !== null) {
        samples.push(parsed);
      }
    }
    if (samples.length < 5) {
      return mapping;
    }
    const max = Math.max(...samples);
    const min = Math.min(...samples);
    const looksLikeHectares = max > 0 && max < 200;
    const looksLikeSquareMeters = max >= 1000 || min >= 100;

    if (looksLikeHectares && mapping.superficieUnit === 'MQ') {
      return { ...mapping, superficieUnit: 'HA' };
    }
    if (looksLikeSquareMeters && mapping.superficieUnit === 'HA') {
      return { ...mapping, superficieUnit: 'MQ' };
    }
    if (mapping.superficieUnit === 'UNKNOWN' && (looksLikeHectares || looksLikeSquareMeters)) {
      return { ...mapping, superficieUnit: looksLikeSquareMeters ? 'MQ' : 'HA' };
    }
    return mapping;
  }

  private getCompactSataMapping(headers: string[]): FieldColumnMapping | null {
    const headerByKey = new Map(headers.map((header) => [sharedNormalizeString(header), header]));
    const pick = (...keys: string[]): string | null => {
      for (const key of keys) {
        const header = headerByKey.get(sharedNormalizeString(key));
        if (header) return header;
      }
      return null;
    };

    const fieldName = pick('Nome campo');
    const foglio = pick('Fog.', 'Foglio');
    const particella = pick('Part.', 'Particella');
    const superficieCatastale = pick('Sup. catast.', 'Superficie Catastale');
    const crop = pick('Coltura primaria');

    if (!fieldName || !foglio || !particella || !superficieCatastale || !crop) {
      return null;
    }

    return {
      columns: {
        unitaProduttiva: fieldName,
        regione: null,
        provincia: null,
        comune: null,
        cap: null,
        indirizzo: null,
        sezione: pick('Sez.', 'Sezione'),
        foglio,
        particella,
        subalterno: pick('Sub', 'Subalterno'),
        superficieCatastale,
        superficieGrafica: pick('Sup. grafica', 'Superficie Grafica'),
        sau: pick('Sup. uso primario', 'Superficie uso primario'),
        usoSuolo: crop,
        qualita: pick('Dest. uso', 'Destinazione uso'),
        dataInizio: pick('Inizio semina', 'Data inizio semina'),
        dataFine: pick('Fine semina', 'Data fine semina'),
      },
      superficieUnit: 'HA',
      dateFormat: 'DD/MM/YYYY',
    };
  }

  // CSV parsing, file conversion, and value helpers – delegated to csv_parser.ts
  private bufferToCsv(buffer: Buffer): string {
    return bufferToCsv(buffer);
  }

  private parseCsv(content: string): { headers: string[]; rows: ParsedRow[] } {
    return sharedParseCsv(content);
  }

  private getValue(row: ParsedRow, columnName: string | null): string {
    return sharedGetValue(row, columnName) ?? '';
  }

  private parseNumber(value: string): number | null {
    return sharedParseNumber(value);
  }

  /**
   * Get column mapping from LLM - only sends headers + sample rows
   */
  private async getColumnMapping(
    headers: string[],
    sampleRows: ParsedRow[],
  ): Promise<FieldColumnMapping> {
    const sampleData = sampleRows.slice(0, 5).map((row) => {
      const sample: Record<string, string> = {};
      headers.forEach((h) => {
        if (row[h]) {
          sample[h] = row[h].slice(0, 100); // Truncate long values
        }
      });
      return sample;
    });

    const usageAccumulator = new UsageAccumulator();
    const usageCollector = new LangChainUsageCollector(usageAccumulator);
    const extractor = this.getModel().withStructuredOutput(FieldColumnMappingSchema);

    const messages = [
      {
        role: 'system' as const,
        content: `Sei un esperto di dati agricoli italiani. Analizza le intestazioni CSV e le righe di esempio per identificare il mapping delle colonne.

OBIETTIVO: Mappa ogni colonna al suo significato semantico per l'estrazione di dati catastali dei campi agricoli.

FORMATI CSV COMUNI:

1. **Formato AGEA/Emilia-Romagna**:
   - Colonna "FOGLIO " (con spazio finale) o "FOGLIO": numero foglio catastale
   - Colonna "PARTICELLA": numero particella
   - Colonna "SUBALTERNO": subalterno (può essere vuoto)
   - Colonna "COMUNE": comune (es. "ALFONSINE", "BAGNACAVALLO")
   - Colonna "REGIONE": regione (es. "EMILIA ROMAGNA")
   - Colonna "PROVINCIA": sigla provincia (es. "RA", "FE")
   - Colonna "SUPERFICIE(ha)": superficie in ettari (ATTENZIONE: può avere parentesi e unità nel nome)
   - Colonna "OCCUPAZIONE SUOLO": coltura/uso suolo (es. "ERBA MEDICA", "GRANTURCO (MAIS)")
   - Colonna "DATA INIZIO UTILIZZO": data inizio (formato DD-MM-YYYY)
   - Colonna "DATA FINE UTILIZZO": data fine (formato DD-MM-YYYY)

2. **Formato SATA/SIAN**:
   - Colonna "Foglio": foglio catastale
   - Colonna "Particella": particella
   - Colonna "Sezione": sezione
   - Colonna "Superficie Catastale": superficie in ettari
   - Colonna "Comune Descrizione": comune con provincia (es. "POZZOLO FORMIGARO (AL)")

COLONNE DA IDENTIFICARE:
1. **Identificativi**:
   - unitaProduttiva: Nome azienda/unità (es. "Ragione Sociale", "Azienda", "Unita Produttiva")

2. **Ubicazione**:
   - regione: Regione (es. "REGIONE", "Regione", "EMILIA ROMAGNA")
   - provincia: Provincia (es. "PROVINCIA", "Provincia", "RA", "FE")
   - comune: Comune (es. "COMUNE", "Comune", "Comune Descrizione")
   - cap: CAP
   - indirizzo: Indirizzo

3. **Dati Catastali** (OBBLIGATORI):
   - foglio: Foglio catastale (es. "FOGLIO ", "Foglio", "FGL", "Fgl.") - ATTENZIONE: può avere spazio finale
   - particella: Particella (es. "PARTICELLA", "Particella", "PART", "Part.")
   - sezione: Sezione (es. "Sezione", "SEZ", "Sez.")
   - subalterno: Subalterno (es. "SUBALTERNO", "Subalterno", "SUB", "Sub.")

4. **Superfici**:
   - superficieCatastale: Superficie catastale (es. "SUPERFICIE(ha)", "Superficie Catastale", "Sup. Cat.", "Superficie(ha)")
   - superficieGrafica: Superficie grafica (es. "Superficie Grafica", "Sup. Graf.")
   - sau: SAU (es. "SAU", "Superficie Agricola", "Superficie Agricola Utilizzabile")

5. **Uso del suolo**:
   - usoSuolo: Uso/occupazione suolo (es. "OCCUPAZIONE SUOLO", "Occupazione Suolo", "Uso", "Coltura")
   - qualita: Qualità catastale (es. "QUALITA", "Qualita", "Qualità")

6. **Date**:
   - dataInizio: Data inizio (es. "DATA INIZIO UTILIZZO", "Data Inizio Utilizzo", "Data inizio Semina Primario")
   - dataFine: Data fine (es. "DATA FINE UTILIZZO", "Data Fine Utilizzo", "Data fine Semina Primario")

REGOLE CRITICHE:
- Restituisci il NOME ESATTO della colonna come appare nelle intestazioni (inclusi spazi finali, parentesi, maiuscole/minuscole)
- Se una colonna non esiste, restituisci null
- Foglio e Particella sono OBBLIGATORI - devono essere identificati
- ATTENZIONE: "FOGLIO " (con spazio) è diverso da "FOGLIO" (senza spazio) - usa il nome esatto
- ATTENZIONE: "SUPERFICIE(ha)" può avere parentesi e unità nel nome colonna
- Rileva l'unità di misura delle superfici (HA o MQ) - se la colonna contiene "(ha)" nel nome, è HA
- Rileva il formato delle date (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, etc.)
- Per il formato Emilia-Romagna, le date sono spesso DD-MM-YYYY (es. "11-11-2024")`,
      },
      {
        role: 'user' as const,
        content: `Headers: ${JSON.stringify(headers)}\n\nSample rows:\n${JSON.stringify(sampleData, null, 2)}`,
      },
    ];

    const result = await invokeLLMWithRetry(
      (msgs, opts) => extractor.invoke(msgs, opts),
      messages,
      { callbacks: [usageCollector] },
      { maxRetries: 2, timeoutMs: 30_000 },
    );

    // Log usage asynchronously
    usageLogger
      .logFromAccumulator(usageAccumulator, {
        jobType: LlmJobType.CSV_IMPORT,
        model: 'gpt-4o-mini',
        metadata: { step: 'field-csv-column-mapping' },
      })
      .catch((err) => console.warn('[FIELD-CSV] Failed to log usage:', err));

    return result as FieldColumnMapping;
  }

  /**
   * Extract rows using the column mapping
   */
  private extractRowsWithMapping(rows: ParsedRow[], mapping: FieldColumnMapping): ParsedRow[] {
    const cols = mapping.columns;

    // Validate required columns exist
    if (!cols.foglio || !cols.particella) {
      throw new Error('Colonne obbligatorie (Foglio, Particella) non trovate nel CSV');
    }

    // Filter rows with valid foglio/particella
    return rows.filter((row) => {
      const foglio = this.getValue(row, cols.foglio);
      const particella = this.getValue(row, cols.particella);
      return foglio && particella && foglio.length > 0 && particella.length > 0;
    });
  }

  /**
   * Aggregate rows by particella
   */
  private aggregateByParticella(rows: ParsedRow[], mapping: FieldColumnMapping): AggregatedField[] {
    const cols = mapping.columns;
    const particellaMap = new Map<string, AggregatedField>();

    // Fill-down support for repeated values
    let lastUnitaProduttiva = '';
    let lastComune = '';
    let lastRegione = '';
    let lastProvincia = '';

    for (const row of rows) {
      const foglio = this.getValue(row, cols.foglio);
      const particella = this.getValue(row, cols.particella);
      const sezione = this.getValue(row, cols.sezione) || null;

      // Fill-down logic
      const unitaProduttiva = this.getValue(row, cols.unitaProduttiva) || lastUnitaProduttiva;
      const comune = this.getValue(row, cols.comune) || lastComune;
      const regione = this.getValue(row, cols.regione) || lastRegione;
      const provincia = this.getValue(row, cols.provincia) || lastProvincia;

      if (unitaProduttiva) lastUnitaProduttiva = unitaProduttiva;
      if (comune) lastComune = comune;
      if (regione) lastRegione = regione;
      if (provincia) lastProvincia = provincia;

      const key = `${foglio}_${particella}_${sezione || 'NOSEZ'}`;

      // Parse surfaces
      const supCatValue = this.getValue(row, cols.superficieCatastale);
      const supGrafValue = this.getValue(row, cols.superficieGrafica);
      const sauValue = this.getValue(row, cols.sau);

      const supCatHa = this.parseAreaToHa(supCatValue, mapping.superficieUnit);
      const supGrafHa = this.parseAreaToHa(supGrafValue, mapping.superficieUnit);
      const sauHa = this.parseAreaToHa(sauValue, mapping.superficieUnit);

      // Get uso suolo and qualita
      const usoSuolo = this.getValue(row, cols.usoSuolo);
      const qualita = this.getValue(row, cols.qualita) || null;

      // Get dates
      const dataInizio = this.getValue(row, cols.dataInizio);
      const dataFine = this.getValue(row, cols.dataFine);

      if (!particellaMap.has(key)) {
        // First occurrence: create the field
        particellaMap.set(key, {
          unitaProduttiva,
          regione: regione || null,
          provincia: provincia || null,
          comune,
          indirizzo: this.getValue(row, cols.indirizzo) || null,
          cap: this.getValue(row, cols.cap) || null,
          sezione,
          foglio,
          particella,
          subalterno: this.getValue(row, cols.subalterno) || null,
          superficieCatastaleHa: supCatHa,
          superficieGraficaHa: supGrafHa,
          sauHa,
          usiSuolo: usoSuolo ? [usoSuolo] : [],
          qualita,
          dateInizio: dataInizio ? [dataInizio] : [],
          dateFine: dataFine ? [dataFine] : [],
        });
      } else {
        // Aggregate: add uso and dates, take max surfaces
        const existing = particellaMap.get(key)!;
        if (usoSuolo && !existing.usiSuolo.includes(usoSuolo)) {
          existing.usiSuolo.push(usoSuolo);
        }
        if (dataInizio && !existing.dateInizio.includes(dataInizio)) {
          existing.dateInizio.push(dataInizio);
        }
        if (dataFine && !existing.dateFine.includes(dataFine)) {
          existing.dateFine.push(dataFine);
        }
        // Update surfaces with max values
        existing.superficieCatastaleHa = this.getMaxValue(existing.superficieCatastaleHa, supCatHa);
        existing.superficieGraficaHa = this.getMaxValue(existing.superficieGraficaHa, supGrafHa);
        existing.sauHa = this.getMaxValue(existing.sauHa, sauHa);
      }
    }

    return Array.from(particellaMap.values());
  }

  /**
   * Parse area value to hectares based on detected unit
   */
  private parseAreaToHa(value: string, unit: 'HA' | 'MQ' | 'UNKNOWN'): number | null {
    const parsed = this.parseNumber(value);
    if (parsed === null) return null;

    if (unit === 'MQ') {
      return parsed / 10000; // Convert MQ to HA
    }
    return parsed; // Already in HA or unknown (assume HA)
  }

  /**
   * Convert aggregated fields to output format
   */
  private convertToOutputFormat(
    aggregatedFields: AggregatedField[],
    mapping: FieldColumnMapping,
  ): FieldRecord[] {
    return aggregatedFields.map((field, i) => {
      // Convert surface from HA to MQ
      const superficieCatastaleMq =
        field.superficieCatastaleHa !== null
          ? Math.round(field.superficieCatastaleHa * 10000)
          : null;

      const cityName = field.comune || 'Unknown';
      const displayName = field.comune || field.unitaProduttiva || cityName;
      const name =
        field.foglio && field.particella
          ? `${displayName} - F${field.foglio} P${field.particella}`
          : `${displayName} - Campo ${i + 1}`;

      // Convert dates
      const inizioConduzione = field.dateInizio[0]
        ? this.convertDate(field.dateInizio[0], mapping.dateFormat)
        : null;
      const fineConduzione = field.dateFine[0]
        ? this.convertDate(field.dateFine[0], mapping.dateFormat)
        : null;

      // Combine usi suolo (exclude non-agricultural uses)
      const uso =
        field.usiSuolo
          .filter((u: string) => u && !u.includes('FABBRICATI') && !u.includes('NON AGRICOLO'))
          .join(', ') || null;

      // Address should NOT be taken from unitaProduttiva if it contains crop names
      // Only use it if it looks like an address (contains " - " with 3 parts: CODE - CITY - ADDRESS)
      let address: string | null = field.indirizzo || null;
      if (!address && field.unitaProduttiva) {
        const parts = field.unitaProduttiva.split(' - ').filter((p) => p.trim().length > 0);
        // If unitaProduttiva has format "CODE - CITY - ADDRESS", use the address part
        if (parts.length >= 3) {
          address = parts.slice(2).join(' - ');
        }
        // Otherwise, don't use unitaProduttiva as address (it might be a crop name)
      }

      return {
        name,
        nation: 'IT',
        region: field.regione,
        city: cityName,
        address,
        cap: field.cap,
        foglio: field.foglio,
        particella: field.particella,
        subalterno: field.subalterno,
        sezione: field.sezione,
        superficieCatastaleMq,
        gisHa: field.superficieGraficaHa,
        sauHa: field.sauHa,
        variazioneMq: null,
        uso,
        qualita: field.qualita,
        soilType: null,
        ph: null,
        nitrogen: null,
        phosphorus: null,
        potassium: null,
        calcium: null,
        magnesium: null,
        latitude: null,
        longitude: null,
        inizioConduzione,
        fineConduzione,
      };
    });
  }

  /**
   * Convert date from detected format to YYYY-MM-DD
   */
  private convertDate(
    dateStr: string,
    format: 'DD/MM/YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD' | 'UNKNOWN',
  ): string | null {
    if (!dateStr) return null;

    // Handle timestamp format: "2025-01-01 00:00:00.0" -> extract date part
    const timestampMatch = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
    if (timestampMatch) {
      return timestampMatch[1]; // Return YYYY-MM-DD part
    }

    if (format === 'YYYY-MM-DD') {
      // Extract just the date part if there's extra content
      const dateOnly = dateStr.split(' ')[0];
      if (dateOnly.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dateOnly;
      }
      return dateStr; // Already in correct format
    }

    // Split by common separators
    const parts = dateStr.split(/[\/\-\.]/);
    if (parts.length === 3) {
      // DD/MM/YYYY or DD-MM-YYYY format
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2].split(' ')[0]; // Take only year part if there's extra content

      // Validate
      if (year.length === 4) {
        return `${year}-${month}-${day}`;
      }
    }

    return null;
  }

  /**
   * Get max of two nullable numbers
   */
  private getMaxValue(current: number | null, candidate: number | null): number | null {
    if (current === null && candidate === null) {
      return null;
    }
    if (current === null) {
      return candidate;
    }
    if (candidate === null) {
      return current;
    }
    return Math.max(current, candidate);
  }

  /**
   * Fallback: Extract fields using LLM when deterministic parsing fails
   */
  private async extractFieldsWithLLM(csvContent: string): Promise<ExtractedFieldData> {
    const lines = csvContent.split('\n').filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      throw new Error('CSV troppo corto per estrarre fields');
    }

    // Take header + first 50 rows for LLM analysis
    const sampleLines = lines.slice(0, Math.min(51, lines.length));
    const sampleContent = sampleLines.join('\n');

    console.log('FieldCsvAgent: Using LLM for full field extraction');

    const fieldUsageAccumulator = new UsageAccumulator();
    const fieldUsageCollector = new LangChainUsageCollector(fieldUsageAccumulator);
    const extractor = this.getModel().withStructuredOutput(FieldOutputSchema);

    const llmMessages = [
      {
        role: 'system' as const,
        content: `Sei un esperto di dati agricoli italiani. Analizza il CSV e estrai i dati dei campi agricoli (fields).

OBIETTIVO: Estrarre tutti i campi agricoli dal CSV, aggregandoli per particella catastale (foglio + particella + sezione).

REGOLE:
1. **Aggregazione**: Se più righe hanno lo stesso foglio+particella+sezione, crea UN SOLO field aggregando:
   - Superfici: usa il valore massimo
   - Uso del suolo: combina tutti gli usi (es. "Vite, Pero, Albicocco")
   - Date: usa la prima data inizio e l'ultima data fine

2. **Dati Catastali** (OBBLIGATORI):
   - foglio: Numero foglio catastale (stringa)
   - particella: Numero particella (stringa)
   - sezione: Sezione catastale (può essere null)
   - subalterno: Subalterno (può essere null)

3. **Superfici**:
   - superficieCatastaleMq: Superficie in METRI QUADRI (se il CSV ha ettari, moltiplica per 10000)
   - gisHa: Superficie grafica in ettari (se presente)
   - sauHa: SAU in ettari (se presente)

4. **Ubicazione**:
   - city: Comune (estrai da colonne come "COMUNE", "Comune Descrizione", ecc.)
   - region: Regione (se presente)
   - address: Indirizzo (solo se è un indirizzo reale, NON usare colture come indirizzo)

5. **Uso del suolo**:
   - uso: Combina tutte le colture/usi del suolo per quella particella (es. "Vite, Pero, Albicocco")

6. **Date**:
   - inizioConduzione: Data inizio in formato YYYY-MM-DD (estrai da timestamp se necessario)
   - fineConduzione: Data fine in formato YYYY-MM-DD

7. **Nome field**:
   - name: Crea un nome come "COMUNE - F{foglio} P{particella}" (es. "Ravenna - F83 P8")

IMPORTANTE:
- Aggrega per particella: stesso foglio+particella+sezione = UN SOLO field
- Non usare mai colture come indirizzo (es. "ERBA MEDICA", "SOIA", "VITE" non sono indirizzi)
- Converti tutte le superfici in MQ per superficieCatastaleMq
- Gestisci date con timestamp (es. "2025-01-01 00:00:00.0" → "2025-01-01")`,
      },
      {
        role: 'user' as const,
        content: `Estrai i fields da questo CSV:\n\n${sampleContent}`,
      },
    ];

    const result = await invokeLLMWithRetry(
      (msgs, opts) => extractor.invoke(msgs, opts),
      llmMessages,
      { callbacks: [fieldUsageCollector] },
      { maxRetries: 2, timeoutMs: 60_000 },
    );

    // Log usage asynchronously
    usageLogger
      .logFromAccumulator(fieldUsageAccumulator, {
        jobType: LlmJobType.CSV_IMPORT,
        model: 'gpt-4o-mini',
        metadata: { step: 'field-csv-full-extraction', rowsSampled: sampleLines.length },
      })
      .catch((err) => console.warn('[FIELD-CSV] Failed to log full extraction usage:', err));

    return result as ExtractedFieldData;
  }

  /**
   * Extract fields using Lombardia format (deterministic, no LLM needed)
   * Format: CUAA;SUPERO;COMUNE;PROV;SEZ CENS;FOGLIO;MAPPALE;SUB;...
   */
  private extractFieldsLombardiaFormat(rows: ParsedRow[]): ExtractedFieldData {
    const cols = LOMBARDIA_COLUMN_MAPPING;
    const particellaMap = new Map<string, AggregatedField>();

    // Fill-down support
    let lastCuaa = '';
    let lastComune = '';
    let lastProvincia = '';
    let rowIndex = 0; // Counter for unique keys

    for (const row of rows) {
      rowIndex++;
      const foglio = this.getValue(row, cols.foglio);
      const mappale = this.getValue(row, cols.mappale); // Particella in Lombardia
      const sezione = this.getValue(row, cols.sezioneCensuaria) || null;

      // Skip rows without required cadastral data
      if (!foglio || !mappale) {
        continue;
      }

      // Fill-down logic
      const cuaa = this.getValue(row, cols.cuaa) || lastCuaa;
      const comune = this.getValue(row, cols.comune) || lastComune;
      const provincia = this.getValue(row, cols.provincia) || lastProvincia;

      if (cuaa) lastCuaa = cuaa;
      if (comune) lastComune = comune;
      if (provincia) lastProvincia = provincia;

      // For Lombardia, create a unique field for each row (each TIPO UTILIZZO)
      // This ensures that fields with multiple land uses are imported as separate fields
      const tipoUtilizzo = this.getValue(row, cols.tipoUtilizzo);
      const key = `${foglio}_${mappale}_${sezione || 'NOSEZ'}_${tipoUtilizzo || rowIndex}`;

      // Parse surfaces (all in MQ in Lombardia format)
      const supGis = this.parseNumber(this.getValue(row, cols.superficieGis));
      const supUtilizzata = this.parseNumber(this.getValue(row, cols.superficieUtilizzata));
      const supCatastale = this.parseNumber(this.getValue(row, cols.superficieCatastale));
      const superficie = this.parseNumber(this.getValue(row, cols.superficie));

      // Use the best available surface value
      const superficieMq = supCatastale ?? supGis ?? supUtilizzata ?? superficie;

      // Parse uso suolo from TIPO UTILIZZO (tipoUtilizzo already declared above for key)
      const usoSuolo = parseUsoSuoloFromTipoUtilizzo(tipoUtilizzo);

      // Parse dates
      const dataFineContratto = this.getValue(row, cols.dataFineContratto);
      const dataSemina = this.getValue(row, cols.dataSemina);
      const dataRaccolta = this.getValue(row, cols.dataRaccolta);

      // Get region from province
      const regione = getRegioneFromProvincia(provincia);

      if (!particellaMap.has(key)) {
        particellaMap.set(key, {
          unitaProduttiva: cuaa,
          regione,
          provincia,
          comune,
          indirizzo: null,
          cap: null,
          sezione,
          foglio,
          particella: mappale,
          subalterno: this.getValue(row, cols.subalterno) || null,
          superficieCatastaleHa: superficieMq !== null ? superficieMq / 10000 : null,
          superficieGraficaHa: supGis !== null ? supGis / 10000 : null,
          sauHa: supUtilizzata !== null ? supUtilizzata / 10000 : null,
          usiSuolo: usoSuolo ? [usoSuolo] : [],
          qualita: null,
          dateInizio: dataSemina ? [dataSemina] : [],
          dateFine: dataFineContratto ? [dataFineContratto] : dataRaccolta ? [dataRaccolta] : [],
        });
      } else {
        // Aggregate
        const existing = particellaMap.get(key)!;
        if (usoSuolo && !existing.usiSuolo.includes(usoSuolo)) {
          existing.usiSuolo.push(usoSuolo);
        }
        if (dataSemina && !existing.dateInizio.includes(dataSemina)) {
          existing.dateInizio.push(dataSemina);
        }
        const endDate = dataFineContratto || dataRaccolta;
        if (endDate && !existing.dateFine.includes(endDate)) {
          existing.dateFine.push(endDate);
        }
        // Update surfaces with max values
        const newSupHa = superficieMq !== null ? superficieMq / 10000 : null;
        existing.superficieCatastaleHa = this.getMaxValue(existing.superficieCatastaleHa, newSupHa);
        existing.superficieGraficaHa = this.getMaxValue(
          existing.superficieGraficaHa,
          supGis !== null ? supGis / 10000 : null,
        );
        existing.sauHa = this.getMaxValue(
          existing.sauHa,
          supUtilizzata !== null ? supUtilizzata / 10000 : null,
        );
      }
    }

    const aggregatedFields = Array.from(particellaMap.values());
    console.log(`FieldCsvAgent: Lombardia format - Aggregated ${aggregatedFields.length} fields`);

    // Convert to output format
    const fields: FieldRecord[] = aggregatedFields.map((field, i) => {
      const superficieCatastaleMq =
        field.superficieCatastaleHa !== null
          ? Math.round(field.superficieCatastaleHa * 10000)
          : null;

      const cityName = field.comune || 'Unknown';
      const usoLabel = field.usiSuolo[0] ? ` - ${field.usiSuolo[0].substring(0, 40)}` : '';
      const name =
        field.foglio && field.particella
          ? `${cityName} - F${field.foglio} P${field.particella}${usoLabel}`
          : `${cityName} - Campo ${i + 1}${usoLabel}`;

      // Convert Lombardia dates (DD/MM/YYYY) to ISO
      const inizioConduzione = field.dateInizio[0] ? parseLombardiaDate(field.dateInizio[0]) : null;
      const fineConduzione = field.dateFine[0] ? parseLombardiaDate(field.dateFine[0]) : null;

      // Filter out non-agricultural uses
      const uso = field.usiSuolo.filter((u) => u && u !== 'USO NON AGRICOLO').join(', ') || null;

      return {
        name,
        nation: 'IT',
        region: field.regione,
        city: cityName,
        address: null,
        cap: null,
        foglio: field.foglio,
        particella: field.particella,
        subalterno: field.subalterno,
        sezione: field.sezione,
        superficieCatastaleMq,
        gisHa: field.superficieGraficaHa,
        sauHa: field.sauHa,
        variazioneMq: null,
        uso,
        qualita: null,
        soilType: null,
        ph: null,
        nitrogen: null,
        phosphorus: null,
        potassium: null,
        calcium: null,
        magnesium: null,
        latitude: null,
        longitude: null,
        inizioConduzione,
        fineConduzione,
      };
    });

    return { fields };
  }

  /**
   * Extract fields using Emilia-Romagna format (deterministic, no LLM needed)
   * Format: ID. DOMANDA;ANNO;...;FOGLIO ;PARTICELLA;SUBALTERNO;...;OCCUPAZIONE SUOLO;...;SUPERFICIE(ha);...
   */
  private extractFieldsEmiliaRomagnaFormat(rows: ParsedRow[]): ExtractedFieldData {
    const cols = EMILIA_ROMAGNA_COLUMN_MAPPING;
    const particellaMap = new Map<string, AggregatedField>();

    // Fill-down support
    let lastCuaa = '';
    let lastRagioneSociale = '';
    let lastComune = '';
    let lastProvincia = '';
    let lastRegione = '';

    for (const row of rows) {
      // Try both "FOGLIO " (with space) and "FOGLIO" (without space)
      let foglio = this.getValue(row, cols.foglio);
      if (!foglio) {
        foglio = this.getValue(row, 'FOGLIO');
      }
      const particella = this.getValue(row, cols.particella);
      const subalterno = this.getValue(row, cols.subalterno) || null;

      // Skip rows without required cadastral data
      if (!foglio || !particella) {
        continue;
      }

      // Fill-down logic
      const cuaa = this.getValue(row, cols.cuaa) || lastCuaa;
      const ragioneSociale = this.getValue(row, cols.ragioneSociale) || lastRagioneSociale;
      const comune = this.getValue(row, cols.comune) || lastComune;
      const provincia = this.getValue(row, cols.provincia) || lastProvincia;
      const regione = this.getValue(row, cols.regione) || lastRegione;

      if (cuaa) lastCuaa = cuaa;
      if (ragioneSociale) lastRagioneSociale = ragioneSociale;
      if (comune) lastComune = comune;
      if (provincia) lastProvincia = provincia;
      if (regione) lastRegione = regione;

      // Normalize particella (remove leading zeros for key but keep original)
      const normalizedParticella = particella.replace(/^0+/, '') || particella;
      const key = `${foglio}_${normalizedParticella}_${subalterno || 'NOSUB'}`;

      // Parse superficie (already in HA in Emilia-Romagna format)
      const superficieHa = parseEmiliaRomagnaSuperficie(this.getValue(row, cols.superficieHa));

      // Parse uso suolo from OCCUPAZIONE SUOLO
      const occupazioneSuolo = this.getValue(row, cols.occupazioneSuolo);
      const usoSuolo = parseUsoSuoloFromOccupazione(occupazioneSuolo);

      // Skip non-agricultural uses for SAU calculation
      // FLAG SAU = 'N' is the authoritative AGEA indicator (covers BOSCO, USO FORESTALE, etc.)
      const flagSauValue = this.getValue(row, cols.flagSau) ?? '';
      const isNonAgricultural =
        (flagSauValue.trim() !== '' && !isSauRow(flagSauValue)) ||
        isEmiliaRomagnaNonAgricultural(occupazioneSuolo);

      // Parse dates (DD-MM-YYYY format)
      const dataInizioUtilizzo = this.getValue(row, cols.dataInizioUtilizzo);
      const dataFineUtilizzo = this.getValue(row, cols.dataFineUtilizzo);

      // Get qualita
      const qualita = this.getValue(row, cols.qualita) || null;

      if (!particellaMap.has(key)) {
        particellaMap.set(key, {
          unitaProduttiva: ragioneSociale || cuaa,
          regione: normalizeRegione(regione),
          provincia,
          comune,
          indirizzo: null,
          cap: null,
          sezione: null, // Emilia-Romagna format doesn't have sezione in the same way
          foglio,
          particella: normalizedParticella,
          subalterno,
          // Sum all surfaces (each row is a different portion/use of the same particella)
          superficieCatastaleHa: superficieHa ?? 0,
          superficieGraficaHa: null, // Not available in this format
          // SAU starts at 0 and sums only agricultural surfaces
          sauHa: isNonAgricultural ? 0 : superficieHa ?? 0,
          // Include ALL uses (agricultural and non-agricultural) for visibility
          usiSuolo: usoSuolo ? [usoSuolo] : [],
          qualita,
          dateInizio: dataInizioUtilizzo ? [dataInizioUtilizzo] : [],
          dateFine: dataFineUtilizzo ? [dataFineUtilizzo] : [],
        });
      } else {
        // Aggregate
        const existing = particellaMap.get(key)!;

        // Add uso suolo if not duplicate (include non-agricultural for visibility)
        if (usoSuolo && !existing.usiSuolo.includes(usoSuolo)) {
          existing.usiSuolo.push(usoSuolo);
        }

        // Add dates if not duplicate
        if (dataInizioUtilizzo && !existing.dateInizio.includes(dataInizioUtilizzo)) {
          existing.dateInizio.push(dataInizioUtilizzo);
        }
        if (dataFineUtilizzo && !existing.dateFine.includes(dataFineUtilizzo)) {
          existing.dateFine.push(dataFineUtilizzo);
        }

        // Update surfaces - SUM all portions (each row is a different use of the particella)
        if (superficieHa !== null && superficieHa > 0) {
          // Sum all surfaces for total catastale area
          existing.superficieCatastaleHa = (existing.superficieCatastaleHa ?? 0) + superficieHa;

          // For SAU, sum only agricultural surfaces
          if (!isNonAgricultural) {
            existing.sauHa = (existing.sauHa ?? 0) + superficieHa;
          }
        }
      }
    }

    const aggregatedFields = Array.from(particellaMap.values());
    console.log(
      `FieldCsvAgent: Emilia-Romagna format - Aggregated ${aggregatedFields.length} fields`,
    );

    // Convert to output format
    const fields: FieldRecord[] = aggregatedFields.map((field, i) => {
      // Convert HA to MQ, keeping precision for small values
      // 0.0042 ha = 42 mq, 0.0002 ha = 2 mq
      const superficieCatastaleMq =
        field.superficieCatastaleHa !== null && field.superficieCatastaleHa > 0
          ? Math.round(field.superficieCatastaleHa * 10000)
          : null;

      // Keep SAU in HA, null only if truly 0 or not set
      // SAU is 0 for non-agricultural land, not null (to avoid errors)
      const sauHaValue = field.sauHa ?? 0;

      const cityName = field.comune || 'Unknown';
      const name =
        field.foglio && field.particella
          ? `${cityName} - F${field.foglio} P${field.particella}`
          : `${cityName} - Campo ${i + 1}`;

      // Convert Emilia-Romagna dates (DD-MM-YYYY) to ISO
      const inizioConduzione = field.dateInizio[0]
        ? parseEmiliaRomagnaDate(field.dateInizio[0])
        : null;
      const fineConduzione = field.dateFine[0] ? parseEmiliaRomagnaDate(field.dateFine[0]) : null;

      // Include ALL uses (agricultural and non-agricultural) for visibility
      const uso = field.usiSuolo.filter((u) => u).join(', ') || null;

      return {
        name,
        nation: 'IT',
        region: field.regione,
        city: cityName,
        address: null,
        cap: null,
        foglio: field.foglio,
        particella: field.particella,
        subalterno: field.subalterno,
        sezione: field.sezione,
        superficieCatastaleMq,
        gisHa: field.superficieGraficaHa,
        sauHa: sauHaValue,
        variazioneMq: null,
        uso,
        qualita: field.qualita,
        soilType: null,
        ph: null,
        nitrogen: null,
        phosphorus: null,
        potassium: null,
        calcium: null,
        magnesium: null,
        latitude: null,
        longitude: null,
        inizioConduzione,
        fineConduzione,
      };
    });

    return { fields };
  }

  /**
   * Extract fields using Piemonte format (deterministic, no LLM needed)
   * Format: Unita produttiva;Comune Istat;Comune Descrizione;Sezione;Foglio;Particella;...
   */
  private extractFieldsPiemonteFormat(rows: ParsedRow[]): ExtractedFieldData {
    const cols = PIEMONTE_COLUMN_MAPPING;
    const particellaMap = new Map<string, AggregatedField>();

    // Fill-down support
    let lastUnitaProduttiva = '';
    let lastComuneDescrizione = '';

    for (const row of rows) {
      const foglio = this.getValue(row, cols.foglio);
      const particella = this.getValue(row, cols.particella);
      const sezione = this.getValue(row, cols.sezione) || null;
      const subalterno = this.getValue(row, cols.subalterno) || null;

      // Skip rows without required cadastral data
      if (!foglio || !particella) {
        continue;
      }

      // Fill-down logic
      const unitaProduttiva = this.getValue(row, cols.unitaProduttiva) || lastUnitaProduttiva;
      const comuneDescrizione = this.getValue(row, cols.comuneDescrizione) || lastComuneDescrizione;

      if (unitaProduttiva) lastUnitaProduttiva = unitaProduttiva;
      if (comuneDescrizione) lastComuneDescrizione = comuneDescrizione;

      // Parse comune and provincia
      const { comune, provincia } = parseComuneDescrizione(comuneDescrizione);
      // Determine region: first try from provincia, then from comune name
      const regione = provincia
        ? getPiemonteRegione(provincia)
        : getRegioneFromComune(comune) || 'ITALIA';

      // Parse unita produttiva for address
      const { address } = parseUnitaProduttiva(unitaProduttiva);

      const key = `${foglio}_${particella}_${sezione || 'NOSEZ'}_${subalterno || 'NOSUB'}`;

      // Parse surfaces (all in HA in Piemonte format)
      const superficieCatastaleHa = parsePiemonteSuperficie(
        this.getValue(row, cols.superficieCatastale),
      );
      const superficieGraficaHa = parsePiemonteSuperficie(
        this.getValue(row, cols.superficieGrafica),
      );
      const superficieAgricolaHa = parsePiemonteSuperficie(
        this.getValue(row, cols.superficieAgricola),
      );
      const superficiePrimarioHa = parsePiemonteSuperficie(
        this.getValue(row, cols.superficiePrimario),
      );

      // Parse uso suolo from occupazione primario
      const occupazionePrimario = this.getValue(row, cols.occupazioneSuoloPrimario);
      const usoSuolo = parsePiemonteUsoSuolo(occupazionePrimario);

      // Check if non-agricultural
      const isNonAgricultural = isPiemonteNonAgricultural(occupazionePrimario);

      // Parse dates
      const dataInizio = this.getValue(row, cols.dataInizioSeminaPrimario);
      const dataFine = this.getValue(row, cols.dataFineSeminaPrimario);

      // Get qualita
      const qualita = this.getValue(row, cols.qualitaPrimario);
      const qualitaParsed =
        qualita && qualita !== '[000] -' ? qualita.replace(/^\[\d+\]\s*/, '') : null;

      if (!particellaMap.has(key)) {
        particellaMap.set(key, {
          unitaProduttiva,
          regione,
          provincia,
          comune,
          indirizzo: address,
          cap: null,
          sezione,
          foglio,
          particella,
          subalterno,
          superficieCatastaleHa: superficieCatastaleHa ?? 0,
          superficieGraficaHa: superficieGraficaHa ?? null,
          // SAU starts at 0 and sums only agricultural surfaces
          sauHa: isNonAgricultural ? 0 : superficiePrimarioHa ?? superficieAgricolaHa ?? 0,
          usiSuolo: usoSuolo ? [usoSuolo] : [],
          qualita: qualitaParsed,
          dateInizio: dataInizio ? [dataInizio] : [],
          dateFine: dataFine ? [dataFine] : [],
        });
      } else {
        // Aggregate
        const existing = particellaMap.get(key)!;

        // Add uso suolo if not duplicate
        if (usoSuolo && !existing.usiSuolo.includes(usoSuolo)) {
          existing.usiSuolo.push(usoSuolo);
        }

        // Add dates if not duplicate
        if (dataInizio && !existing.dateInizio.includes(dataInizio)) {
          existing.dateInizio.push(dataInizio);
        }
        if (dataFine && !existing.dateFine.includes(dataFine)) {
          existing.dateFine.push(dataFine);
        }

        // Update surfaces - SUM all portions
        if (superficiePrimarioHa !== null && superficiePrimarioHa > 0) {
          // For SAU, sum only agricultural surfaces
          if (!isNonAgricultural) {
            existing.sauHa = (existing.sauHa ?? 0) + superficiePrimarioHa;
          }
        }

        // Keep max catastale and grafica
        existing.superficieCatastaleHa = this.getMaxValue(
          existing.superficieCatastaleHa,
          superficieCatastaleHa,
        );
        existing.superficieGraficaHa = this.getMaxValue(
          existing.superficieGraficaHa,
          superficieGraficaHa,
        );
      }
    }

    const aggregatedFields = Array.from(particellaMap.values());
    console.log(`FieldCsvAgent: Piemonte format - Aggregated ${aggregatedFields.length} fields`);

    // Convert to output format
    const fields: FieldRecord[] = aggregatedFields.map((field, i) => {
      // Convert HA to MQ
      const superficieCatastaleMq =
        field.superficieCatastaleHa !== null && field.superficieCatastaleHa > 0
          ? Math.round(field.superficieCatastaleHa * 10000)
          : null;

      const sauHaValue = field.sauHa ?? 0;

      const cityName = field.comune || 'Unknown';
      const name =
        field.foglio && field.particella
          ? `${cityName} - F${field.foglio} P${field.particella}`
          : `${cityName} - Campo ${i + 1}`;

      // Convert Piemonte dates (DD/MM/YYYY) to ISO
      const inizioConduzione = field.dateInizio[0] ? parsePiemonteDate(field.dateInizio[0]) : null;
      const fineConduzione = field.dateFine[0] ? parsePiemonteDate(field.dateFine[0]) : null;

      // Filter non-agricultural uses for display
      const uso = field.usiSuolo.filter((u) => u).join(', ') || null;

      return {
        name,
        nation: 'IT',
        region: field.regione,
        city: cityName,
        address: field.indirizzo,
        cap: null,
        foglio: field.foglio,
        particella: field.particella,
        subalterno: field.subalterno,
        sezione: field.sezione,
        superficieCatastaleMq,
        gisHa: field.superficieGraficaHa,
        sauHa: sauHaValue,
        variazioneMq: null,
        uso,
        qualita: field.qualita,
        soilType: null,
        ph: null,
        nitrogen: null,
        phosphorus: null,
        potassium: null,
        calcium: null,
        magnesium: null,
        latitude: null,
        longitude: null,
        inizioConduzione,
        fineConduzione,
      };
    });

    return { fields };
  }

  /**
   * Extract fields using Veneto format (deterministic, no LLM needed)
   * Format: Similar to Piemonte but SAU is taken from "Superficie Uso Suolo Primario"
   * Reference file: 'campi_elisa Adami.xlsx'
   */
  private extractFieldsVenetoFormat(rows: ParsedRow[]): ExtractedFieldData {
    const cols = VENETO_COLUMN_MAPPING;
    const particellaMap = new Map<string, AggregatedField>();

    // Fill-down support
    let lastUnitaProduttiva = '';
    let lastComuneDescrizione = '';

    for (const row of rows) {
      const foglio = this.getValue(row, cols.foglio);
      const particella = this.getValue(row, cols.particella);
      const sezione = this.getValue(row, cols.sezione) || null;
      const subalterno = this.getValue(row, cols.subalterno) || null;

      // Skip rows without required cadastral data
      if (!foglio || !particella) {
        continue;
      }

      // Fill-down logic
      const unitaProduttiva = this.getValue(row, cols.unitaProduttiva) || lastUnitaProduttiva;
      const comuneDescrizione = this.getValue(row, cols.comuneDescrizione) || lastComuneDescrizione;

      if (unitaProduttiva) lastUnitaProduttiva = unitaProduttiva;
      if (comuneDescrizione) lastComuneDescrizione = comuneDescrizione;

      // Parse comune and provincia
      const { comune, provincia } = parseVenetoComuneDescrizione(comuneDescrizione);
      // Determine region: first try from provincia, then from comune name
      const regione = provincia
        ? getVenetoRegione(provincia)
        : getVenetoRegioneFromComune(comune) || 'VENETO';

      // Parse unita produttiva for address
      const { address } = parseVenetoUnitaProduttiva(unitaProduttiva);

      const key = `${foglio}_${particella}_${sezione || 'NOSEZ'}_${subalterno || 'NOSUB'}`;

      // Parse surfaces (all in HA in Veneto format)
      const superficieCatastaleHa = parseVenetoSuperficie(
        this.getValue(row, cols.superficieCatastale),
      );
      const superficieGraficaHa = parseVenetoSuperficie(this.getValue(row, cols.superficieGrafica));
      // IMPORTANTE: Per il Veneto, SAU viene presa SOLO da "Superficie Uso Suolo Primario"
      const superficiePrimarioHa = parseVenetoSuperficie(
        this.getValue(row, cols.superficiePrimario),
      );

      // Parse uso suolo from occupazione primario
      const occupazionePrimario = this.getValue(row, cols.occupazioneSuoloPrimario);
      const usoSuolo = parseVenetoUsoSuolo(occupazionePrimario);

      // Check if non-agricultural
      const isNonAgricultural = isVenetoNonAgricultural(occupazionePrimario);

      // Parse dates
      const dataInizio = this.getValue(row, cols.dataInizioSeminaPrimario);
      const dataFine = this.getValue(row, cols.dataFineSeminaPrimario);

      // Get qualita
      const qualita = this.getValue(row, cols.qualitaPrimario);
      const qualitaParsed =
        qualita && qualita !== '[000] -' ? qualita.replace(/^\[\d+\]\s*/, '') : null;

      if (!particellaMap.has(key)) {
        particellaMap.set(key, {
          unitaProduttiva,
          regione,
          provincia,
          comune,
          indirizzo: address,
          cap: null,
          sezione,
          foglio,
          particella,
          subalterno,
          superficieCatastaleHa: superficieCatastaleHa ?? 0,
          superficieGraficaHa: superficieGraficaHa ?? null,
          // SAU per il Veneto: SOLO da "Superficie Uso Suolo Primario"
          sauHa: isNonAgricultural ? 0 : superficiePrimarioHa ?? 0,
          usiSuolo: usoSuolo ? [usoSuolo] : [],
          qualita: qualitaParsed,
          dateInizio: dataInizio ? [dataInizio] : [],
          dateFine: dataFine ? [dataFine] : [],
        });
      } else {
        // Aggregate
        const existing = particellaMap.get(key)!;

        // Add uso suolo if not duplicate
        if (usoSuolo && !existing.usiSuolo.includes(usoSuolo)) {
          existing.usiSuolo.push(usoSuolo);
        }

        // Add dates if not duplicate
        if (dataInizio && !existing.dateInizio.includes(dataInizio)) {
          existing.dateInizio.push(dataInizio);
        }
        if (dataFine && !existing.dateFine.includes(dataFine)) {
          existing.dateFine.push(dataFine);
        }

        // Update surfaces - SUM all portions
        if (superficiePrimarioHa !== null && superficiePrimarioHa > 0) {
          // For SAU, sum only agricultural surfaces from "Superficie Uso Suolo Primario"
          if (!isNonAgricultural) {
            existing.sauHa = (existing.sauHa ?? 0) + superficiePrimarioHa;
          }
        }

        // Keep max catastale and grafica
        existing.superficieCatastaleHa = this.getMaxValue(
          existing.superficieCatastaleHa,
          superficieCatastaleHa,
        );
        existing.superficieGraficaHa = this.getMaxValue(
          existing.superficieGraficaHa,
          superficieGraficaHa,
        );
      }
    }

    const aggregatedFields = Array.from(particellaMap.values());
    console.log(`FieldCsvAgent: Veneto format - Aggregated ${aggregatedFields.length} fields`);

    // Convert to output format
    const fields: FieldRecord[] = aggregatedFields.map((field, i) => {
      // Convert HA to MQ
      const superficieCatastaleMq =
        field.superficieCatastaleHa !== null && field.superficieCatastaleHa > 0
          ? Math.round(field.superficieCatastaleHa * 10000)
          : null;

      const sauHaValue = field.sauHa ?? 0;

      const cityName = field.comune || 'Unknown';
      const name =
        field.foglio && field.particella
          ? `${cityName} - F${field.foglio} P${field.particella}`
          : `${cityName} - Campo ${i + 1}`;

      // Convert Veneto dates (DD/MM/YYYY) to ISO
      const inizioConduzione = field.dateInizio[0] ? parseVenetoDate(field.dateInizio[0]) : null;
      const fineConduzione = field.dateFine[0] ? parseVenetoDate(field.dateFine[0]) : null;

      // Filter non-agricultural uses for display
      const uso = field.usiSuolo.filter((u) => u).join(', ') || null;

      return {
        name,
        nation: 'IT',
        region: field.regione,
        city: cityName,
        address: field.indirizzo,
        cap: null,
        foglio: field.foglio,
        particella: field.particella,
        subalterno: field.subalterno,
        sezione: field.sezione,
        superficieCatastaleMq,
        gisHa: field.superficieGraficaHa,
        sauHa: sauHaValue,
        variazioneMq: null,
        uso,
        qualita: field.qualita,
        soilType: null,
        ph: null,
        nitrogen: null,
        phosphorus: null,
        potassium: null,
        calcium: null,
        magnesium: null,
        latitude: null,
        longitude: null,
        inizioConduzione,
        fineConduzione,
      };
    });

    return { fields };
  }

  /**
   * Extract fields using Veneto AVEPA "Piano Utilizzo" format (deterministic, no LLM needed)
   *
   * This format has:
   * - Headers starting around row 22 with columns: Comune, Sez, Fog., Part., Sub, Sup. Catastale, etc.
   * - PAC AGEA codes in "1a Coltura" column (e.g., "(870-011-000-000-000)" for ORZO)
   * - Crop description in "Column_24" (unlabeled column after 1a Coltura)
   * - "Sup. Utilizzata" contains the actual used area in MQ
   * - "Sup. Catastale" contains cadastral area in MQ
   *
   * Each row in the Excel file becomes ONE field (no aggregation by particella).
   * SAU is taken from "Sup. Utilizzata" column. All rows are imported.
   */
  private extractFieldsVenetoAVEPAFormat(rows: ParsedRow[], headers: string[]): ExtractedFieldData {
    const fields: FieldRecord[] = [];

    // Log headers for debugging
    console.log(`FieldCsvAgent: AVEPA headers: ${headers.slice(0, 30).join(', ')}`);

    // Find the crop description column (usually Column_24, the one after "1a Coltura")
    const colturaDescColumnIndex = headers.findIndex((h) => h === '1a Coltura') + 2; // Skip one empty column
    const colturaDescColumnName = headers[colturaDescColumnIndex] || 'Column_24';

    console.log(
      `FieldCsvAgent: AVEPA crop description column: "${colturaDescColumnName}" at index ${colturaDescColumnIndex}`,
    );

    let rowIndex = 0;
    for (const row of rows) {
      rowIndex++;

      // Get cadastral info using the actual column names from the detector
      const comune = this.getValue(row, 'Comune') || '';
      const sezione = this.getValue(row, 'Sez') || null;
      const foglio = this.getValue(row, 'Fog.') || this.getValue(row, 'Foglio') || null;
      const particella = this.getValue(row, 'Particella') || this.getValue(row, 'Part.') || null;
      const subalterno = this.getValue(row, 'Sub') || null;

      // Skip rows without required cadastral data
      if (!foglio || !particella) {
        console.log(`FieldCsvAgent: AVEPA row ${rowIndex} skipped - missing foglio or particella`);
        continue;
      }

      // Get coltura description from Column_24 (or similar unlabeled column)
      // This contains values like "ORZO - FAVE, SEMI, GRANELLA - ORZO"
      const colturaDesc =
        this.getValue(row, colturaDescColumnName) || this.getValue(row, 'Column_24') || '';
      const { name: colturaName } = parsePrimaColturaColumn(colturaDesc);

      // Get surfaces - ALL values in AVEPA format are in MQ (square meters)
      // Example: Sup. Catastale = 2437 MQ, Sup. Utilizzata = 2162 MQ, 42 MQ, etc.
      // Always convert to HA by dividing by 10000
      const supCatastaleRaw = this.getValue(row, 'Sup. Catastale') || '';
      const supCatastaleNum = this.parseNumber(supCatastaleRaw);
      const supCatastaleHa = supCatastaleNum !== null ? supCatastaleNum / 10000 : null;

      const supUtilizzataRaw = this.getValue(row, 'Sup. Utilizzata') || '';
      const supUtilizzataNum = this.parseNumber(supUtilizzataRaw);
      const supUtilizzataHa = supUtilizzataNum !== null ? supUtilizzataNum / 10000 : null;

      // Parse comune to extract city name and province (e.g., "ARCOLE (VR)" -> ARCOLE, VR)
      const { comune: cityName, provincia } = parseVenetoComuneDescrizione(comune);
      const regione = provincia
        ? getVenetoRegione(provincia)
        : getVenetoRegioneFromComune(cityName) || 'VENETO';

      // Convert HA to MQ for superficieCatastale output
      const superficieCatastaleMq =
        supCatastaleHa !== null && supCatastaleHa > 0 ? Math.round(supCatastaleHa * 10000) : null;

      // SAU is taken directly from "Sup. Utilizzata" - all rows are included
      const sauHaValue = supUtilizzataHa ?? 0;

      // Build field name with row index for uniqueness
      const name = `${cityName || 'Unknown'} - F${foglio} P${particella}${subalterno ? ` S${subalterno}` : ''} [${rowIndex}]`;

      fields.push({
        name,
        nation: 'IT',
        region: regione,
        city: cityName || 'Unknown',
        address: null,
        cap: null,
        foglio,
        particella,
        subalterno,
        sezione,
        superficieCatastaleMq,
        gisHa: null,
        sauHa: sauHaValue,
        variazioneMq: null,
        uso: colturaName || null,
        qualita: null,
        soilType: null,
        ph: null,
        nitrogen: null,
        phosphorus: null,
        potassium: null,
        calcium: null,
        magnesium: null,
        latitude: null,
        longitude: null,
        inizioConduzione: null,
        fineConduzione: null,
      });
    }

    console.log(
      `FieldCsvAgent: Veneto AVEPA format - Extracted ${fields.length} fields (1 per row)`,
    );

    return { fields };
  }

  /**
   * Extract fields using CIA Schedario Viticolo format (deterministic, no LLM needed)
   *
   * This format is a vineyard cadastral registry from CIA (old B1).
   * Each row is a UNAR (sub-unit within a parcel) with a specific grape variety.
   * Fields are aggregated by FOGLIO + PARTICELLA + SEZIONE.
   * Surfaces are in MQ (square meters).
   * Land use is implicitly "Vite" for all rows.
   */
  private extractFieldsCiaSchedarioViticoloFormat(rows: ParsedRow[]): ExtractedFieldData {
    const cols = CIA_SCHEDARIO_VITICOLO_COLUMN_MAPPING;
    const particellaMap = new Map<string, AggregatedField>();

    for (const row of rows) {
      const foglio = this.getValue(row, cols.foglio);
      const particella = this.getValue(row, cols.particella);
      const sezione = this.getValue(row, cols.sezione) || null;

      // Skip rows without required cadastral data
      if (!foglio || !particella) {
        continue;
      }

      const comune = this.getValue(row, cols.comune);
      const provincia = this.getValue(row, cols.provincia);
      const regione = getCiaRegione(provincia);

      const key = `${foglio}_${particella}_${sezione || 'NOSEZ'}`;

      // Parse surfaces (all in MQ in this format)
      const supCatastaleMq = parseCiaNumber(this.getValue(row, cols.superficieCatastale));
      const supGisMq = parseCiaNumber(this.getValue(row, cols.superficieGis));
      const supVitataMq = parseCiaNumber(this.getValue(row, cols.supVitataDichiarata));

      // Get grape variety as land use
      const descrizioneVitigno = this.getValue(row, cols.descrizioneVitigno);
      const { name: vitignoName } = normalizeVitignoName(descrizioneVitigno);
      const usoSuolo = vitignoName ? `Vite - ${vitignoName}` : 'Vite';

      if (!particellaMap.has(key)) {
        particellaMap.set(key, {
          unitaProduttiva: '',
          regione: regione || null,
          provincia: provincia || null,
          comune,
          indirizzo: null,
          cap: null,
          sezione,
          foglio,
          particella,
          subalterno: null,
          // Superficie Catastale is the same for all UNARs of the same particella
          superficieCatastaleHa: supCatastaleMq !== null ? supCatastaleMq / 10000 : null,
          superficieGraficaHa: supGisMq !== null ? supGisMq / 10000 : null,
          // SAU is the sum of all SUP. VITATA DICHIARATA for this particella
          sauHa: supVitataMq !== null ? supVitataMq / 10000 : 0,
          usiSuolo: usoSuolo ? [usoSuolo] : [],
          qualita: null,
          dateInizio: [],
          dateFine: [],
        });
      } else {
        const existing = particellaMap.get(key)!;

        // Add uso suolo (grape variety) if not already present
        if (usoSuolo && !existing.usiSuolo.includes(usoSuolo)) {
          existing.usiSuolo.push(usoSuolo);
        }

        // Superficie Catastale: keep max (should be same for all UNARs of same particella)
        existing.superficieCatastaleHa = this.getMaxValue(
          existing.superficieCatastaleHa,
          supCatastaleMq !== null ? supCatastaleMq / 10000 : null,
        );
        existing.superficieGraficaHa = this.getMaxValue(
          existing.superficieGraficaHa,
          supGisMq !== null ? supGisMq / 10000 : null,
        );
        // SAU: SUM the vitata area for all UNARs
        if (supVitataMq !== null && supVitataMq > 0) {
          existing.sauHa = (existing.sauHa ?? 0) + supVitataMq / 10000;
        }
      }
    }

    const aggregatedFields = Array.from(particellaMap.values());
    console.log(
      `FieldCsvAgent: CIA Schedario Viticolo format - Aggregated ${aggregatedFields.length} fields`,
    );

    // Convert to output format
    const fields: FieldRecord[] = aggregatedFields.map((field, i) => {
      const superficieCatastaleMq =
        field.superficieCatastaleHa !== null && field.superficieCatastaleHa > 0
          ? Math.round(field.superficieCatastaleHa * 10000)
          : null;

      const sauHaValue = field.sauHa ?? 0;

      const cityName = field.comune || 'Unknown';
      const name =
        field.foglio && field.particella
          ? `${cityName} - F${field.foglio} P${field.particella}`
          : `${cityName} - Campo ${i + 1}`;

      // Combine all grape varieties as land use
      const uso = field.usiSuolo.filter((u) => u).join(', ') || 'Vite';

      return {
        name,
        nation: 'IT',
        region: field.regione,
        city: cityName,
        address: null,
        cap: null,
        foglio: field.foglio,
        particella: field.particella,
        subalterno: field.subalterno,
        sezione: field.sezione,
        superficieCatastaleMq,
        gisHa: field.superficieGraficaHa,
        sauHa: sauHaValue,
        variazioneMq: null,
        uso,
        qualita: null,
        soilType: null,
        ph: null,
        nitrogen: null,
        phosphorus: null,
        potassium: null,
        calcium: null,
        magnesium: null,
        latitude: null,
        longitude: null,
        inizioConduzione: null,
        fineConduzione: null,
      };
    });

    return { fields };
  }

  /**
   * Get or create the LLM model
   */
  private getModel(): ChatOpenAI {
    if (!this.model) {
      const { model } = createChatModel({
        modelName: 'gpt-4o-mini',
        temperature: 0,
      });
      this.model = model;
    }
    return this.model;
  }
}
