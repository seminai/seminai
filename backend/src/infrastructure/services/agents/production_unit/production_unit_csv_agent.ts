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
  parseDate as sharedParseDate,
  normalizeString as sharedNormalizeString,
  cleanBracketValue as sharedCleanBracketValue,
  parseOccupazione as sharedParseOccupazione,
  validateColumnMapping,
  invokeLLMWithRetry,
} from '../file_agent/utils/csv_parser';
import {
  isLombardiaFormat,
  LOMBARDIA_COLUMN_MAPPING,
  parseCropFromTipoUtilizzo,
  parseLombardiaDate,
  isNonAgriculturalUse,
  parseColtivazioneCycle,
  getBestAreaMq,
} from '../file_agent/template/lombardia_file_structure';
import {
  isPiemonteFormat,
  PIEMONTE_COLUMN_MAPPING,
  parseUsoSuoloFromOccupazione as parsePiemonteUsoSuolo,
  parsePiemonteDate,
  parsePiemonteSuperficie,
  parseComuneDescrizione,
  extractCropCode,
  isNonAgriculturalUse as isPiemonteNonAgricultural,
} from '../file_agent/template/piemonte_file_structure';
import {
  isEmiliaRomagnaFormat,
  EMILIA_ROMAGNA_COLUMN_MAPPING,
  parseUsoSuoloFromOccupazione as parseEmiliaRomagnaUsoSuolo,
  parseEmiliaRomagnaDate,
  parseEmiliaRomagnaSuperficie,
  isNonAgriculturalUse as isEmiliaRomagnaNonAgricultural,
  isSauRow as isEmiliaRomagnaSauRow,
} from '../file_agent/template/emilia_romagna_file_structure';
import {
  isVenetoFormat,
  VENETO_COLUMN_MAPPING,
  parseUsoSuoloFromOccupazione as parseVenetoUsoSuolo,
  parseVenetoDate,
  parseVenetoSuperficie,
  isNonAgriculturalUse as isVenetoNonAgricultural,
  isVenetoAVEPAFormat,
  parsePacCodeFromColumn,
  parsePrimaColturaColumn,
  parseAVEPASuperficie,
  findPacCodeColumnIndex,
  parseComuneDescrizione as parseVenetoComuneDescrizione,
} from '../file_agent/template/veneto_file_structure';
import {
  isCiaSchedarioViticoloFormat,
  CIA_SCHEDARIO_VITICOLO_COLUMN_MAPPING,
  parseCiaNumber,
  normalizeVitignoName,
} from '../file_agent/template/cia_schedario_viticolo_file_structure';
import {
  batchInterpretPacCodes,
  parsePacCodeString,
  isNonAgriculturalPacCode,
} from '../../tool/agea_pac_codification';
import { detectAndExtractHeaders, convertToParseResult } from '../file_agent/utils/header_detector';
import { LlmJobType } from '@prisma/client';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { getCropCatalog, type CropCatalogEntry } from '../../extraction/production-unit-normalizer';
import {
  applyExactCatalogFallback,
  isUnresolvedCropName,
  resolveUnresolvedCropsWithLlm,
} from '../../extraction/crop-catalog-resolver';
import { createChatModel } from '../../llm-model-factory';

const usageLogger = LlmUsageLogger.getInstance();

/**
 * Schema for crop identification by LLM
 */
const CropIdentificationSchema = z.object({
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

type CropIdentification = z.infer<typeof CropIdentificationSchema>;

/**
 * Input for crop identification with optional variety
 */
interface CropIdentificationInput {
  cropName: string;
  variety: string | null;
}

/**
 * Schema for batch crop identification
 */
const BatchCropIdentificationSchema = z.object({
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
const ColumnMappingSchema = z.object({
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
interface AggregationKey {
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

/**
 * Agent for extracting production units from CSV files.
 * Uses a two-phase approach:
 * 1. LLM phase: Analyze headers and sample rows to determine column mapping and format
 * 2. Deterministic phase: Parse all rows using the mapping, aggregate by occupation+dates
 */
export class ProductionUnitCsvAgent {
  private model: ChatOpenAI | null = null;
  private cropCache: Map<string, CropIdentification> = new Map();
  private cropCatalogCache: CropCatalogEntry[] | null = null;

  private applyCropCacheToUnits(aggregated: Map<string, ProductionUnitRaw>): void {
    for (const unit of aggregated.values()) {
      for (const cycle of unit.cycles) {
        if (!cycle.cropName) continue;
        const cacheKey = this.buildCropCacheKey(cycle.cropName, cycle.variety);
        const cached = this.cropCache.get(cacheKey);
        if (!cached) continue;
        cycle.cropType = cached.cropType;
        if (cached.variety) cycle.variety = cached.variety;
        if (cached.species) cycle.cropName = cached.species;
      }
    }
  }

  private collectUnresolvedCropInputs(
    aggregated: Map<string, ProductionUnitRaw>,
  ): CropIdentificationInput[] {
    if (!this.cropCatalogCache) {
      this.cropCatalogCache = getCropCatalog();
    }
    const catalog = this.cropCatalogCache;
    const seen = new Set<string>();
    const inputs: CropIdentificationInput[] = [];
    for (const unit of aggregated.values()) {
      for (const cycle of unit.cycles) {
        if (!cycle.cropName || !isUnresolvedCropName(cycle.cropName, catalog)) continue;
        const cacheKey = this.buildCropCacheKey(cycle.cropName, cycle.variety);
        const cached = this.cropCache.get(cacheKey);
        if (cached?.species) continue;
        if (seen.has(cacheKey)) continue;
        seen.add(cacheKey);
        inputs.push({ cropName: cycle.cropName, variety: cycle.variety });
      }
    }
    return inputs;
  }

  private async finalizeCropIdentification(
    aggregated: Map<string, ProductionUnitRaw>,
  ): Promise<void> {
    this.applyCropCacheToUnits(aggregated);
    if (!this.cropCatalogCache) {
      this.cropCatalogCache = getCropCatalog();
    }
    const unresolvedInputs = this.collectUnresolvedCropInputs(aggregated);
    if (unresolvedInputs.length > 0) {
      const usageAccumulator = new UsageAccumulator();
      const usageCollector = new LangChainUsageCollector(usageAccumulator);
      const extractor = this.getModel().withStructuredOutput(BatchCropIdentificationSchema);
      const resolved = await resolveUnresolvedCropsWithLlm({
        inputs: unresolvedInputs,
        catalog: this.cropCatalogCache,
        invokeBatch: (messages, opts) =>
          invokeLLMWithRetry((msgs, o) => extractor.invoke(msgs, o), messages, opts, {
            maxRetries: 2,
            timeoutMs: 30_000,
          }),
        callbacks: [usageCollector],
      });
      for (const row of resolved) {
        const cacheKey = this.buildCropCacheKey(row.input.cropName, row.input.variety);
        this.cropCache.set(cacheKey, row.identification);
      }
      usageLogger
        .logFromAccumulator(usageAccumulator, {
          jobType: LlmJobType.CSV_IMPORT,
          model: 'gpt-4o-mini',
          metadata: {
            step: 'production-unit-crop-catalog-resolver',
            cropCount: unresolvedInputs.length,
          },
        })
        .catch((err) =>
          console.warn('[PRODUCTION-UNIT-CSV] Failed to log catalog resolver usage:', err),
        );
      this.applyCropCacheToUnits(aggregated);
    }
    for (const unit of aggregated.values()) {
      for (const cycle of unit.cycles) {
        const fallback = applyExactCatalogFallback(cycle.cropName, this.cropCatalogCache);
        if (fallback) {
          cycle.cropName = fallback.species;
          if (!cycle.cropCode) cycle.cropCode = fallback.code;
        }
      }
    }
  }

  /**
   * Extract production units from CSV/Excel buffer.
   * Returns both the extracted units and diagnostics about the extraction process.
   */
  async extractProductionUnitsFromCsv(fileBuffer: Buffer): Promise<ProductionUnitExtractionResult> {
    // Step 0: Try advanced header detection for complex files (multi-row headers, offset rows)
    const detection = detectAndExtractHeaders(fileBuffer);

    // If we detected a known format with the advanced detector, use it
    if (detection.detectedFormat !== 'unknown' && detection.headers.length > 0) {
      console.log(
        `ProductionUnitCsvAgent: Advanced detection found ${detection.detectedFormat} format ` +
          `(headers at row ${detection.headerStartRow}, ${detection.headerRowCount} header rows, ` +
          `${detection.rawRows.length} data rows)`,
      );

      const { rows } = convertToParseResult(detection);

      if (rows.length === 0) {
        return {
          units: [],
          diagnostics: createDiagnostics(0, detection.detectedFormat),
        };
      }

      const format = detection.detectedFormat;

      // Use the appropriate regional parser based on detected format
      if (format === 'lombardia') {
        console.log('ProductionUnitCsvAgent: Using Lombardia format parser (advanced detection)');
        const units = await this.extractLombardiaFormat(rows);
        return { units, diagnostics: createDiagnostics(rows.length, 'LOMBARDIA') };
      }

      if (format === 'piemonte') {
        console.log('ProductionUnitCsvAgent: Using Piemonte format parser (advanced detection)');
        const units = await this.extractPiemonteFormat(rows);
        return { units, diagnostics: createDiagnostics(rows.length, 'PIEMONTE') };
      }

      if (format === 'emilia_romagna') {
        console.log(
          'ProductionUnitCsvAgent: Using Emilia-Romagna format parser (advanced detection)',
        );
        const units = await this.extractEmiliaRomagnaFormat(rows);
        return { units, diagnostics: createDiagnostics(rows.length, 'EMILIA_ROMAGNA') };
      }

      if (format === 'veneto') {
        console.log(
          'ProductionUnitCsvAgent: Using Veneto Standard format parser (advanced detection)',
        );
        const units = await this.extractVenetoStandardFormat(rows);
        return { units, diagnostics: createDiagnostics(rows.length, 'VENETO') };
      }

      if (format === 'veneto_avepa') {
        console.log(
          'ProductionUnitCsvAgent: Using Veneto AVEPA Piano Utilizzo format parser (advanced detection)',
        );
        const units = await this.extractVenetoAVEPAFormat(rows, detection.headers);
        return { units, diagnostics: createDiagnostics(rows.length, 'VENETO_AVEPA') };
      }

      if (format === 'cia_schedario_viticolo') {
        console.log(
          'ProductionUnitCsvAgent: Using CIA Schedario Viticolo format parser (advanced detection)',
        );
        const units = await this.extractCiaSchedarioViticoloFormat(rows);
        return { units, diagnostics: createDiagnostics(rows.length, 'CIA_SCHEDARIO_VITICOLO') };
      }
    }

    // Fallback to original parsing for simple CSV files
    const csvContent = this.bufferToCsv(fileBuffer);
    if (!csvContent.trim()) {
      throw new Error('CSV file is empty');
    }

    // Step 1: Parse CSV
    const { headers, rows } = this.parseCsv(csvContent);
    if (rows.length === 0) {
      return { units: [], diagnostics: createDiagnostics(0, 'UNKNOWN') };
    }

    // Step 1.5: Check for known regional formats (no LLM needed for column mapping)
    if (isLombardiaFormat(headers)) {
      console.log('ProductionUnitCsvAgent: Detected Lombardia format, using deterministic parser');
      const units = await this.extractLombardiaFormat(rows);
      return { units, diagnostics: createDiagnostics(rows.length, 'LOMBARDIA') };
    }

    if (isPiemonteFormat(headers)) {
      console.log('ProductionUnitCsvAgent: Detected Piemonte format, using deterministic parser');
      const units = await this.extractPiemonteFormat(rows);
      return { units, diagnostics: createDiagnostics(rows.length, 'PIEMONTE') };
    }

    if (isEmiliaRomagnaFormat(headers)) {
      console.log(
        'ProductionUnitCsvAgent: Detected Emilia-Romagna format, using deterministic parser',
      );
      const units = await this.extractEmiliaRomagnaFormat(rows);
      return { units, diagnostics: createDiagnostics(rows.length, 'EMILIA_ROMAGNA') };
    }

    if (isVenetoAVEPAFormat(headers)) {
      console.log(
        'ProductionUnitCsvAgent: Detected Veneto AVEPA format, using deterministic parser',
      );
      const units = await this.extractVenetoAVEPAFormat(rows, headers);
      return { units, diagnostics: createDiagnostics(rows.length, 'VENETO_AVEPA') };
    }

    if (isVenetoFormat(headers)) {
      console.log(
        'ProductionUnitCsvAgent: Detected Veneto Standard format, using deterministic parser',
      );
      const units = await this.extractVenetoStandardFormat(rows);
      return { units, diagnostics: createDiagnostics(rows.length, 'VENETO') };
    }

    if (isCiaSchedarioViticoloFormat(headers)) {
      console.log(
        'ProductionUnitCsvAgent: Detected CIA Schedario Viticolo format, using deterministic parser',
      );
      const units = await this.extractCiaSchedarioViticoloFormat(rows);
      return { units, diagnostics: createDiagnostics(rows.length, 'CIA_SCHEDARIO_VITICOLO') };
    }

    // Step 2: Get column mapping from LLM
    const mapping = await this.getColumnMapping(headers, rows.slice(0, 10));

    // Step 2.5: Validate LLM column mapping against actual headers
    const { columns: validatedColumns, warnings: mappingWarnings } = validateColumnMapping(
      mapping.columns,
      headers,
    );
    mapping.columns = validatedColumns as typeof mapping.columns;
    if (mappingWarnings.length > 0) {
      console.warn(`ProductionUnitCsvAgent: Column mapping warnings:`, mappingWarnings);
    }

    const diagnostics = createDiagnostics(rows.length, `LLM_${mapping.format}`);
    diagnostics.warnings.push(...mappingWarnings);

    // Step 3: Collect unique crop+variety combinations for batch identification
    const cropInputs = this.collectUniqueCropInputs(rows, mapping);

    // Step 4: Identify all crops with LLM in batch (with fallback to raw names)
    try {
      await this.identifyCropsWithLLM(cropInputs);
    } catch (error) {
      console.warn(
        'ProductionUnitCsvAgent: Crop identification LLM failed, using raw names as fallback:',
        error instanceof Error ? error.message : String(error),
      );
      diagnostics.warnings.push('Identificazione colture LLM fallita, usati nomi originali');
      for (const input of cropInputs) {
        const cacheKey = this.buildCropCacheKey(input.cropName, input.variety);
        if (!this.cropCache.has(cacheKey)) {
          this.cropCache.set(cacheKey, {
            species: input.cropName,
            cropType: input.cropName,
            code: null,
            variety: input.variety,
          });
        }
      }
    }

    // Step 5: Extract based on format (now with crop info from cache)
    const units =
      mapping.format === 'AGEA'
        ? this.extractAgeaFormat(rows, mapping)
        : this.extractLegacyFormat(rows, mapping);

    diagnostics.extractedRows = units.length;

    // Step 6: If deterministic extraction produced 0 results, try LLM full extraction fallback
    if (units.length === 0 && rows.length > 0) {
      console.warn(
        'ProductionUnitCsvAgent: Deterministic parsing produced 0 results, falling back to LLM full extraction',
      );
      diagnostics.warnings.push(
        'Parsing deterministico ha prodotto 0 risultati, tentativo estrazione LLM completa',
      );
      diagnostics.detectedFormat = 'LLM_FULL_EXTRACTION';
      const llmUnits = await this.extractProductionUnitsWithLLM(csvContent);
      diagnostics.extractedRows = llmUnits.length;
      return { units: llmUnits, diagnostics };
    }

    return { units, diagnostics };
  }

  /**
   * Collect unique crop+variety combinations from all rows for batch LLM identification
   */
  private collectUniqueCropInputs(
    rows: ParsedRow[],
    mapping: ColumnMapping,
  ): CropIdentificationInput[] {
    const cols = mapping.columns;
    const cropInputsMap = new Map<string, CropIdentificationInput>();

    for (const row of rows) {
      // Primary occupation + variety
      const occupazionePrimariaRaw = this.getValue(row, cols.occupazioneSuoloPrimario);
      if (occupazionePrimariaRaw) {
        const { name: occupazioneName } = this.parseOccupazione(occupazionePrimariaRaw);
        if (occupazioneName) {
          const varietaPrimaria = this.cleanBracketValue(
            this.getValue(row, cols.varietaUsoSuoloPrimario),
          );
          const key = this.buildCropCacheKey(occupazioneName, varietaPrimaria);
          if (!cropInputsMap.has(key)) {
            cropInputsMap.set(key, { cropName: occupazioneName, variety: varietaPrimaria });
          }
        }
      }

      // Secondary occupation + variety (if present)
      const occupazioneSecondariaRaw = this.getValue(row, cols.occupazioneSuoloSecondario);
      if (occupazioneSecondariaRaw) {
        const { name: occupazioneSecondariaName } = this.parseOccupazione(occupazioneSecondariaRaw);
        if (occupazioneSecondariaName) {
          const varietaSecondaria = this.cleanBracketValue(
            this.getValue(row, cols.varietaUsoSuoloSecondario),
          );
          const key = this.buildCropCacheKey(occupazioneSecondariaName, varietaSecondaria);
          if (!cropInputsMap.has(key)) {
            cropInputsMap.set(key, {
              cropName: occupazioneSecondariaName,
              variety: varietaSecondaria,
            });
          }
        }
      }

      // Legacy format cropName + variety
      const cropName = this.getValue(row, cols.cropName);
      if (cropName) {
        const variety = this.getValue(row, cols.variety);
        const key = this.buildCropCacheKey(cropName, variety);
        if (!cropInputsMap.has(key)) {
          cropInputsMap.set(key, { cropName, variety });
        }
      }
    }

    return Array.from(cropInputsMap.values());
  }

  /**
   * Build cache key from crop name and variety
   */
  private buildCropCacheKey(cropName: string, variety: string | null): string {
    const cropNorm = this.normalizeString(cropName);
    const varietyNorm = variety ? this.normalizeString(variety) : '';
    return `${cropNorm}|${varietyNorm}`;
  }

  // CSV parsing, file conversion – delegated to csv_parser.ts
  private bufferToCsv(buffer: Buffer): string {
    return bufferToCsv(buffer);
  }

  private parseCsv(content: string): { headers: string[]; rows: ParsedRow[] } {
    return sharedParseCsv(content);
  }

  /**
   * Get column mapping from LLM
   */
  private async getColumnMapping(
    headers: string[],
    sampleRows: ParsedRow[],
  ): Promise<ColumnMapping> {
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
    const extractor = this.getModel().withStructuredOutput(ColumnMappingSchema);

    const messages = [
      {
        role: 'system' as const,
        content: `You are an agricultural data expert. Analyze the CSV headers and sample rows to determine:
1. The format: AGEA if a column like "Occupazione Suolo Uso Suolo Primario" exists, otherwise LEGACY.
2. Map each relevant column to its semantic meaning.

For AGEA format, map these PRIMARY cycle columns:
- occupazioneSuoloPrimario: "Occupazione Suolo Uso Suolo Primario" (with codes like [003] COLZA)
- destinazioneUsoPrimario: "Destinazione Uso Suolo Primario"
- varietaUsoSuoloPrimario: "Varieta Uso Suolo Primario"
- superficieUsoSuoloPrimario: "Superficie Uso Suolo Primario"
- superficieNettaUsoSuoloPrimario: "Superficie Netta Uso Suolo Primario"
- tipoSeminaPrimario: "Tipo Semina Primario" (like AUTUNNO-INVERNO)
- dataInizioSeminaPrimario: "Data inizio Semina Primario" (dd/mm/yyyy)
- dataFineSeminaPrimario: "Data fine Semina Primario" (dd/mm/yyyy)

For AGEA format, map these SECONDARY cycle columns (if present):
- occupazioneSuoloSecondario: "Occupazione Suolo Uso Suolo Secondario"
- destinazioneUsoSecondario: "Destinazione Uso Suolo Secondario"
- varietaUsoSuoloSecondario: "Varieta Uso Suolo Secondario"
- superficieUsoSuoloSecondario: "Superficie Uso Suolo Secondario"
- tipoSeminaSecondario: "Tipo Semina Secondario"
- dataInizioSeminaSecondario: "Data inizio Semina Secondario" (dd/mm/yyyy)
- dataFineSeminaSecondario: "Data fine Semina Secondario" (dd/mm/yyyy)

Also map these common AGEA columns:
- unitName: "Unita produttiva"
- Cadastral info: sezione, foglio, particella, subalterno
- Areas: superficieCatastale, superficieGrafica
- Company: conduttore, aziendaCondAsservimento
- comuneDescrizione, rotazioneColturale, idAppezzamentoAgea

For LEGACY format, map these columns:
- cropName: "Coltura primaria", "Coltura", "Crop", "Occupazione", "Prodotto"
- cropType: "Dest. uso", "Destinazione", "Tipo coltura"
- variety: "Varieta", "Varietà"
- fieldName: "Nome campo", "Campo", "Field", "Appezzamento"
- areaHa: "Sup. uso primario", "Superficie uso", "SAU", "Ettari", "Area", "Superficie Netta"
- startDate: "Inizio semina", "Data inizio", "Start date", "Semina"
- endDate: "Fine semina", "Data fine", "End date", "Raccolta"
- sezione: "Sez.", "Sezione"
- foglio: "Fog.", "Foglio"
- particella: "Part.", "Particella"
- subalterno: "Sub", "Sub.", "Subalterno"

IMPORTANT: For area columns, map the USAGE area (like "Sup. uso primario") to "areaHa", NOT the cadastral area.
Return null for any column you cannot identify.`,
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
        metadata: { step: 'production-unit-column-mapping' },
      })
      .catch((err) => console.warn('[PRODUCTION-UNIT-CSV] Failed to log usage:', err));

    return result as ColumnMapping;
  }

  /**
   * Extract production units from AGEA/SIAN format
   * Groups by: Occupazione Suolo Uso Suolo Primario + Varietà Uso Suolo Primario + Date Primarie
   * Includes primary cycle and secondary cycle (if dates are present)
   */
  private extractAgeaFormat(rows: ParsedRow[], mapping: ColumnMapping): ProductionUnitRaw[] {
    const cols = mapping.columns;
    const aggregated = new Map<string, ProductionUnitRaw>();

    for (const row of rows) {
      // Get PRIMARY occupation (crop) code and name - this is the main grouping key
      const occupazionePrimariaRaw = this.getValue(row, cols.occupazioneSuoloPrimario);
      if (!occupazionePrimariaRaw) {
        continue;
      }

      // Parse occupation like "[003] COLZA" -> code=003, name=COLZA
      const { name: occupazionePrimariaName } = this.parseOccupazione(occupazionePrimariaRaw);

      // Get PRIMARY variety (optional but part of aggregation key)
      const varietaPrimariaRaw = this.getValue(row, cols.varietaUsoSuoloPrimario);
      const varietaPrimaria = this.cleanBracketValue(varietaPrimariaRaw);

      // Get area - prefer Superficie Uso Suolo Primario or Superficie Netta
      let areaHa = this.parseNumber(this.getValue(row, cols.superficieUsoSuoloPrimario));
      if (areaHa === null || areaHa <= 0) {
        areaHa = this.parseNumber(this.getValue(row, cols.superficieNettaUsoSuoloPrimario));
      }
      if (areaHa === null || areaHa <= 0) {
        continue; // Skip rows without valid area
      }

      // Get PRIMARY dates
      const startDatePrimarioRaw = this.getValue(row, cols.dataInizioSeminaPrimario);
      const endDatePrimarioRaw = this.getValue(row, cols.dataFineSeminaPrimario);
      const startDatePrimario = this.parseDate(startDatePrimarioRaw);
      const endDatePrimario = this.parseDate(endDatePrimarioRaw);

      // Build aggregation key: Occupation + Variety + Primary Dates
      const occupazioneNorm = this.normalizeString(
        occupazionePrimariaName || occupazionePrimariaRaw,
      );
      const varietyNorm = this.normalizeString(varietaPrimaria || '');
      const keyObj: AggregationKey = {
        occupazioneNorm,
        varietyNorm,
        startDate: startDatePrimario || 'no_start',
        endDate: endDatePrimario || 'no_end',
      };
      const key = `${keyObj.occupazioneNorm}|${keyObj.varietyNorm}|${keyObj.startDate}|${keyObj.endDate}`;

      // Get cadastral info
      const sezione = this.getValue(row, cols.sezione);
      const foglio = this.getValue(row, cols.foglio);
      const particella = this.getValue(row, cols.particella);
      const subalterno = this.getValue(row, cols.subalterno);
      const unitName = this.getValue(row, cols.unitName) || 'Unità produttiva';

      // Get or create aggregated unit
      let unit = aggregated.get(key);
      if (!unit) {
        // Determine crop name/type from occupation using LLM-identified cache
        const cropInfoPrimario = this.getCropIdentification(
          occupazionePrimariaName || occupazionePrimariaRaw,
          varietaPrimaria,
        );

        // Build unit name from occupation + variety
        const displayVariety = cropInfoPrimario.variety || varietaPrimaria;
        const unitDisplayName = displayVariety
          ? `${occupazionePrimariaName || occupazionePrimariaRaw} - ${displayVariety}`
          : occupazionePrimariaName || occupazionePrimariaRaw;

        // Create PRIMARY cycle
        const primaryCycle: ProductionCycleRaw = {
          cycleIndex: 0,
          cropName: cropInfoPrimario.cropName,
          cropType: cropInfoPrimario.cropType,
          cropCode: cropInfoPrimario.code,
          variety: cropInfoPrimario.variety || varietaPrimaria,
          occupazione: occupazionePrimariaRaw,
          destinazione: this.cleanBracketValue(this.getValue(row, cols.destinazioneUsoPrimario)),
          protectionStructure: this.getValue(row, cols.tipoSeminaPrimario) || null,
          startDate: startDatePrimario,
          endDate: endDatePrimario,
          floweringDate: null,
          harvestingDate: null,
        };

        unit = {
          name: unitDisplayName,
          sezione: null,
          foglio: null,
          particella: null,
          subalterno: null,
          areaHa: 0,
          protocoll: this.getValue(row, cols.rotazioneColturale) || 'AGEA',
          startDate: startDatePrimario,
          endDate: endDatePrimario,
          cycles: [primaryCycle],
          allocations: [],
        };
        aggregated.set(key, unit);

        // Check for SECONDARY cycle (if dates are present)
        const startDateSecondarioRaw = this.getValue(row, cols.dataInizioSeminaSecondario);
        const endDateSecondarioRaw = this.getValue(row, cols.dataFineSeminaSecondario);
        const startDateSecondario = this.parseDate(startDateSecondarioRaw);
        const endDateSecondario = this.parseDate(endDateSecondarioRaw);

        if (startDateSecondario || endDateSecondario) {
          const occupazioneSecondariaRaw = this.getValue(row, cols.occupazioneSuoloSecondario);
          const { name: occupazioneSecondariaName } = this.parseOccupazione(
            occupazioneSecondariaRaw || occupazionePrimariaRaw,
          );
          const varietaSecondariaRaw = this.getValue(row, cols.varietaUsoSuoloSecondario);
          const varietaSecondariaFromCsv =
            this.cleanBracketValue(varietaSecondariaRaw) || varietaPrimaria;

          const cropInfoSecondario = this.getCropIdentification(
            occupazioneSecondariaName || occupazionePrimariaName || occupazionePrimariaRaw,
            varietaSecondariaFromCsv,
          );

          const secondaryCycle: ProductionCycleRaw = {
            cycleIndex: 1,
            cropName: cropInfoSecondario.cropName,
            cropType: cropInfoSecondario.cropType,
            cropCode: cropInfoSecondario.code,
            variety: cropInfoSecondario.variety || varietaSecondariaFromCsv,
            occupazione: occupazioneSecondariaRaw || occupazionePrimariaRaw,
            destinazione: this.cleanBracketValue(
              this.getValue(row, cols.destinazioneUsoSecondario),
            ),
            protectionStructure: this.getValue(row, cols.tipoSeminaSecondario) || null,
            startDate: startDateSecondario,
            endDate: endDateSecondario,
            floweringDate: null,
            harvestingDate: null,
          };

          unit.cycles.push(secondaryCycle);

          // Extend unit dates to include secondary cycle
          if (endDateSecondario && (!unit.endDate || endDateSecondario > unit.endDate)) {
            unit.endDate = endDateSecondario;
          }
        }
      }

      // Find or create allocation for this field
      let allocation = unit.allocations.find(
        (a) =>
          a.foglio === foglio &&
          a.particella === particella &&
          (a.sezione ?? '') === (sezione ?? ''),
      );
      if (!allocation) {
        allocation = {
          fieldName: unitName,
          sezione,
          foglio,
          particella,
          subalterno,
          areaHa: 0,
        };
        unit.allocations.push(allocation);
      }

      // Sum area
      allocation.areaHa += areaHa;
      unit.areaHa = (unit.areaHa || 0) + areaHa;

      // Set cadastral info from first allocation
      if (!unit.sezione && sezione) {
        unit.sezione = sezione;
      }
      if (!unit.foglio && foglio) {
        unit.foglio = foglio;
      }
      if (!unit.particella && particella) {
        unit.particella = particella;
      }
      if (!unit.subalterno && subalterno) {
        unit.subalterno = subalterno;
      }

      // Merge period (extend min/max dates across all rows)
      const primaryStartDate = this.parseDate(this.getValue(row, cols.dataInizioSeminaPrimario));
      const secondaryEndDate = this.parseDate(this.getValue(row, cols.dataFineSeminaSecondario));
      const primaryEndDate = this.parseDate(this.getValue(row, cols.dataFineSeminaPrimario));

      if (primaryStartDate && (!unit.startDate || primaryStartDate < unit.startDate)) {
        unit.startDate = primaryStartDate;
      }
      if (secondaryEndDate && (!unit.endDate || secondaryEndDate > unit.endDate)) {
        unit.endDate = secondaryEndDate;
      } else if (primaryEndDate && (!unit.endDate || primaryEndDate > unit.endDate)) {
        unit.endDate = primaryEndDate;
      }
    }

    // Round areas to 4 decimal places
    for (const unit of aggregated.values()) {
      unit.areaHa = Math.round((unit.areaHa || 0) * 10000) / 10000;
      for (const alloc of unit.allocations) {
        alloc.areaHa = Math.round(alloc.areaHa * 10000) / 10000;
      }
    }

    return Array.from(aggregated.values());
  }

  /**
   * Extract production units from legacy format
   * Groups by cropName + variety + dates
   */
  private extractLegacyFormat(rows: ParsedRow[], mapping: ColumnMapping): ProductionUnitRaw[] {
    const cols = mapping.columns;
    const aggregated = new Map<string, ProductionUnitRaw>();

    for (const row of rows) {
      // Get crop name - this is the main identifier for grouping
      // Try multiple columns: cropName, occupazioneSuoloPrimario (might contain crop in LEGACY format too)
      const cropName =
        this.getValue(row, cols.cropName) ||
        this.getValue(row, cols.occupazioneSuoloPrimario) ||
        'Coltura non specificata';

      // Get variety (optional but part of aggregation key)
      const variety = this.getValue(row, cols.variety);

      // Get field name for allocations - prefer fieldName or unitName
      const fieldName =
        this.getValue(row, cols.fieldName) || this.getValue(row, cols.unitName) || 'Campo';

      // Get area
      let areaHa: number | null = this.parseNumber(this.getValue(row, cols.areaHa));
      if (areaHa === null || areaHa <= 0) {
        areaHa = this.parseNumber(this.getValue(row, cols.superficieAgricola));
      }
      if (areaHa === null || areaHa <= 0) {
        continue;
      }
      // At this point, areaHa is guaranteed to be a positive number
      const areaHaValue: number = areaHa;

      // Get dates
      const startDate = this.parseDate(this.getValue(row, cols.startDate));
      const endDate = this.parseDate(this.getValue(row, cols.endDate));

      // Get cadastral info
      const sezione = this.getValue(row, cols.sezione);
      const foglio = this.getValue(row, cols.foglio);
      const particella = this.getValue(row, cols.particella);
      const subalterno = this.getValue(row, cols.subalterno);

      // Get comune from column mapping
      const comuneRaw = this.getValue(row, cols.comuneDescrizione) || '';

      // Build aggregation key based on CROP + VARIETY + COMUNE + DATES
      const cropNorm = this.normalizeString(cropName);
      const varietyNorm = this.normalizeString(variety || '');
      const comuneNorm = this.normalizeString(comuneRaw);
      const key = `${cropNorm}|${varietyNorm}|${comuneNorm}|${startDate || 'no_start'}|${endDate || 'no_end'}`;

      // Get crop info from LLM-identified cache
      const cropInfo = this.getCropIdentification(cropName, variety);

      // Get or create aggregated unit
      let unit = aggregated.get(key);
      if (!unit) {
        // Build unit name from crop + variety + comune (use normalized variety from LLM if available)
        const displayVariety = cropInfo.variety || variety;
        const comuneLabel = comuneRaw ? ` (${comuneRaw})` : '';
        const unitDisplayName = displayVariety
          ? `${cropName} - ${displayVariety}${comuneLabel}`
          : `${cropName}${comuneLabel}`;

        // Create primary cycle
        const primaryCycle: ProductionCycleRaw = {
          cycleIndex: 0,
          cropName: cropInfo.cropName,
          cropType: cropInfo.cropType,
          cropCode: cropInfo.code,
          variety: cropInfo.variety || variety,
          occupazione: cropName,
          destinazione: this.getValue(row, cols.cropType),
          protectionStructure: this.getValue(row, cols.protectionStructure),
          startDate,
          endDate,
          floweringDate: this.parseDate(this.getValue(row, cols.floweringDate)),
          harvestingDate: this.parseDate(this.getValue(row, cols.harvestingDate)),
        };

        unit = {
          name: unitDisplayName,
          sezione,
          foglio,
          particella,
          subalterno,
          areaHa: 0,
          protocoll: this.getValue(row, cols.protocoll),
          startDate,
          endDate,
          cycles: [primaryCycle],
          allocations: [],
        };
        aggregated.set(key, unit);
      }

      // Find or create allocation
      let allocation = unit.allocations.find(
        (a) =>
          a.foglio === foglio &&
          a.particella === particella &&
          (a.sezione ?? '') === (sezione ?? ''),
      );
      if (!allocation) {
        allocation = {
          fieldName,
          sezione,
          foglio,
          particella,
          subalterno,
          areaHa: 0,
        };
        unit.allocations.push(allocation);
      }

      // Sum area
      allocation.areaHa += areaHaValue;
      unit.areaHa = (unit.areaHa ?? 0) + areaHaValue;
    }

    // Round areas
    for (const unit of aggregated.values()) {
      unit.areaHa = Math.round((unit.areaHa ?? 0) * 10000) / 10000;
      for (const alloc of unit.allocations) {
        alloc.areaHa = Math.round(alloc.areaHa * 10000) / 10000;
      }
    }

    return Array.from(aggregated.values());
  }

  // Value helpers – delegated to csv_parser.ts
  private parseOccupazione(value: string): { code: string | null; name: string | null } {
    return sharedParseOccupazione(value);
  }

  private cleanBracketValue(value: string | null): string | null {
    return sharedCleanBracketValue(value);
  }

  private getValue(row: ParsedRow, colName: string | null): string | null {
    return sharedGetValue(row, colName);
  }

  private parseNumber(value: string | null): number | null {
    return sharedParseNumber(value);
  }

  private parseDate(value: string | null): string | null {
    return sharedParseDate(value);
  }

  private normalizeString(value: string): string {
    return sharedNormalizeString(value);
  }

  /**
   * Identify crops using LLM in batch for efficiency
   * Called after initial extraction to resolve all unique crop+variety combinations
   */
  async identifyCropsWithLLM(cropInputs: CropIdentificationInput[]): Promise<void> {
    // Filter out already cached and non-agricultural uses
    const nonAgricultural = [
      'uso non agricolo',
      'tare',
      'manufatti',
      'seminativi',
      'siepi',
      'fasce alberate',
      'fossati',
      'canali',
      'fasce tampone',
    ];

    const toIdentify = cropInputs.filter((input) => {
      const cacheKey = this.buildCropCacheKey(input.cropName, input.variety);
      if (this.cropCache.has(cacheKey)) {
        return false;
      }
      const nameLower = input.cropName.toLowerCase();
      for (const na of nonAgricultural) {
        if (nameLower.includes(na)) {
          // Cache non-agricultural as-is
          this.cropCache.set(cacheKey, {
            species: input.cropName,
            cropType: input.cropName,
            code: null,
            variety: input.variety,
          });
          return false;
        }
      }
      return true;
    });

    if (toIdentify.length === 0) {
      return;
    }

    // Batch identify with LLM (with retry)
    const cropUsageAccumulator = new UsageAccumulator();
    const cropUsageCollector = new LangChainUsageCollector(cropUsageAccumulator);
    const extractor = this.getModel().withStructuredOutput(BatchCropIdentificationSchema);

    const cropMessages = [
      {
        role: 'system' as const,
        content: `You are an agricultural expert. For each crop (with optional variety) provided, identify:
1. The correct scientific name (species)
2. The common crop type in Italian
3. A code following the pattern: GENUS_SPE (e.g. MALUS_DOM for Malus domestica)
4. The normalized variety name (if provided, normalize it properly e.g. "GRANNY SMITH" -> "Granny Smith")

IMPORTANT DISTINCTIONS:
- "Melo" = Apple tree = Malus domestica (NOT melone!)
- "Melone" = Melon = Cucumis melo
- "Pero" = Pear tree = Pyrus communis
- "Pesco" = Peach tree = Prunus persica
- "Vite" / "Uva" = Grape vine = Vitis vinifera

Common Italian crop names:
- Frumento tenero / Grano tenero = Triticum aestivum
- Frumento duro / Grano duro = Triticum turgidum ssp. durum
- Mais / Granturco = Zea mays
- Orzo = Hordeum vulgare
- Riso = Oryza sativa
- Soia = Glycine max
- Girasole = Helianthus annuus
- Colza = Brassica napus
- Pomodoro = Solanum lycopersicum
- Patata = Solanum tuberosum

For varieties, normalize the case properly (e.g. "GRANNY SMITH" -> "Granny Smith", "golden delicious" -> "Golden Delicious").
Return the cropType as the Italian common name (e.g. "melo", "pero", "vite").`,
      },
      {
        role: 'user' as const,
        content: `Identify these crops:\n${toIdentify
          .map((input, i) => {
            const varietyStr = input.variety ? ` (variety: ${input.variety})` : '';
            return `${i + 1}. "${input.cropName}"${varietyStr}`;
          })
          .join('\n')}`,
      },
    ];

    const result = await invokeLLMWithRetry(
      (msgs, opts) => extractor.invoke(msgs, opts),
      cropMessages,
      { callbacks: [cropUsageCollector] },
      { maxRetries: 2, timeoutMs: 30_000 },
    );

    // Log usage asynchronously
    usageLogger
      .logFromAccumulator(cropUsageAccumulator, {
        jobType: LlmJobType.CSV_IMPORT,
        model: 'gpt-4o-mini',
        metadata: { step: 'production-unit-crop-identification', cropCount: toIdentify.length },
      })
      .catch((err) =>
        console.warn('[PRODUCTION-UNIT-CSV] Failed to log crop identification usage:', err),
      );

    // Cache results
    for (let i = 0; i < result.crops.length; i++) {
      const crop = result.crops[i];
      const originalInput = toIdentify[i];
      const cacheKey = this.buildCropCacheKey(originalInput.cropName, originalInput.variety);
      this.cropCache.set(cacheKey, {
        species: crop.species,
        cropType: crop.cropType,
        code: crop.code,
        variety: crop.variety,
      });
    }
  }

  /**
   * Get crop identification from cache, with fallback
   */
  private getCropIdentification(
    cropName: string,
    variety: string | null,
  ): {
    cropName: string | null;
    cropType: string | null;
    code: string | null;
    variety: string | null;
  } {
    const cacheKey = this.buildCropCacheKey(cropName, variety);
    const cached = this.cropCache.get(cacheKey);
    if (cached) {
      return {
        cropName: cached.species,
        cropType: cached.cropType,
        code: cached.code,
        variety: cached.variety,
      };
    }
    // Fallback if not in cache (shouldn't happen after batch identification)
    return { cropName: null, cropType: cropName, code: null, variety };
  }

  /**
   * Extract production units from Lombardia format (deterministic, no LLM needed for mapping)
   * Format: CUAA;SUPERO;COMUNE;PROV;SEZ CENS;FOGLIO;MAPPALE;SUB;COLTIVAZIONE;TIPO UTILIZZO;...
   *
   * Groups by: TIPO UTILIZZO (crop) + VARIETA + DATE (semina/raccolta)
   */
  private async extractLombardiaFormat(rows: ParsedRow[]): Promise<ProductionUnitRaw[]> {
    const cols = LOMBARDIA_COLUMN_MAPPING;
    const aggregated = new Map<string, ProductionUnitRaw>();

    // Collect unique crops for LLM identification
    const cropInputsMap = new Map<string, CropIdentificationInput>();

    for (const row of rows) {
      const tipoUtilizzo = row[cols.tipoUtilizzo];

      // Skip rows without TIPO UTILIZZO or non-agricultural uses
      if (!tipoUtilizzo || isNonAgriculturalUse(tipoUtilizzo)) {
        continue;
      }

      // Parse crop info
      const cropInfo = parseCropFromTipoUtilizzo(tipoUtilizzo);
      if (!cropInfo.name) {
        continue;
      }

      // Get area in MQ and convert to HA
      const areaMq = getBestAreaMq(row);
      if (areaMq === null || areaMq <= 0) {
        continue;
      }
      const areaHa = areaMq / 10000;

      // Get variety
      const varieta = row[cols.varieta]?.trim() || null;

      // Get dates
      const dataSemina = parseLombardiaDate(row[cols.dataSemina] || '');
      const dataRaccolta = parseLombardiaDate(row[cols.dataRaccolta] || '');
      const dataFineContratto = parseLombardiaDate(row[cols.dataFineContratto] || '');

      // Use semina as start, raccolta or fine contratto as end
      const startDate = dataSemina;
      const endDate = dataRaccolta || dataFineContratto;

      // Get cycle type (Primaria/Secondaria)
      const cycleType = parseColtivazioneCycle(row[cols.coltivazione] || '');
      const cycleLabel = cycleType === 'secondary' ? 'secondaria' : 'primaria';

      // Get cadastral info
      const sezione = row[cols.sezioneCensuaria]?.trim() || null;
      const foglio = row[cols.foglio]?.trim() || null;
      const particella = row[cols.mappale]?.trim() || null; // MAPPALE = Particella
      const subalterno = row[cols.subalterno]?.trim() || null;
      const comune = row[cols.comune]?.trim() || '';

      // Build aggregation key: Crop + Variety + Comune + CycleType + Dates
      const cropNorm = this.normalizeString(cropInfo.name);
      const varietyNorm = varieta ? this.normalizeString(varieta) : '';
      const comuneNorm = this.normalizeString(comune);
      const key = `${cropNorm}|${varietyNorm}|${comuneNorm}|${cycleLabel}|${startDate || 'no_start'}|${endDate || 'no_end'}`;

      // Collect crop for LLM identification
      const cropCacheKey = this.buildCropCacheKey(cropInfo.name, varieta);
      if (!cropInputsMap.has(cropCacheKey) && !this.cropCache.has(cropCacheKey)) {
        cropInputsMap.set(cropCacheKey, { cropName: cropInfo.name, variety: varieta });
      }

      // Get or create aggregated unit
      let unit = aggregated.get(key);
      if (!unit) {
        // Build unit name from crop + variety + comune + cycle type
        const displayVariety = varieta;
        const comuneLabel = comune ? ` (${comune})` : '';
        const cycleDisplayLabel = cycleType === 'secondary' ? ' - Secondaria' : ' - Primaria';
        const unitDisplayName = displayVariety
          ? `${cropInfo.name} - ${displayVariety}${comuneLabel}${cycleDisplayLabel}`
          : `${cropInfo.name}${comuneLabel}${cycleDisplayLabel}`;

        // Create cycle
        const primaryCycle: ProductionCycleRaw = {
          cycleIndex: cycleType === 'secondary' ? 1 : 0,
          cropName: cropInfo.name,
          cropType: cropInfo.name,
          cropCode: cropInfo.code,
          variety: varieta,
          occupazione: tipoUtilizzo,
          destinazione: cropInfo.details,
          protectionStructure: row[cols.epocaSemina]?.trim() || null,
          startDate,
          endDate,
          floweringDate: null,
          harvestingDate: dataRaccolta,
        };

        unit = {
          name: unitDisplayName,
          sezione,
          foglio,
          particella,
          subalterno,
          areaHa: 0,
          protocoll: 'LOMBARDIA',
          startDate,
          endDate,
          cycles: [primaryCycle],
          allocations: [],
        };
        aggregated.set(key, unit);
      }

      // Build field name from comune + cadastral info
      const fieldName = `${comune} - F${foglio || '?'} P${particella || '?'}`;

      // Find or create allocation for this field
      let allocation = unit.allocations.find(
        (a) =>
          a.foglio === foglio &&
          a.particella === particella &&
          (a.sezione ?? '') === (sezione ?? ''),
      );
      if (!allocation) {
        allocation = {
          fieldName,
          sezione,
          foglio,
          particella,
          subalterno,
          areaHa: 0,
        };
        unit.allocations.push(allocation);
      }

      // Sum area
      allocation.areaHa += areaHa;
      unit.areaHa = (unit.areaHa || 0) + areaHa;

      // Set cadastral info from first allocation if not set
      if (!unit.sezione && sezione) unit.sezione = sezione;
      if (!unit.foglio && foglio) unit.foglio = foglio;
      if (!unit.particella && particella) unit.particella = particella;
      if (!unit.subalterno && subalterno) unit.subalterno = subalterno;

      // Extend date range
      if (startDate && (!unit.startDate || startDate < unit.startDate)) {
        unit.startDate = startDate;
      }
      if (endDate && (!unit.endDate || endDate > unit.endDate)) {
        unit.endDate = endDate;
      }
    }

    const cropInputs = Array.from(cropInputsMap.values());
    if (cropInputs.length > 0) {
      await this.identifyCropsWithLLM(cropInputs);
      await this.finalizeCropIdentification(aggregated);
    }

    // Resolve missing dates via LLM based on crop and cycle type
    const unitsNeedingDates: Array<{
      cropName: string;
      cycleType: 'primary' | 'secondary' | null;
      year: string;
    }> = [];
    // Determine the reference year from the first row's annoCampagna
    const referenceYear =
      rows.find((r) => r[cols.annoCampagna]?.trim())?.[cols.annoCampagna]?.trim() ||
      new Date().getFullYear().toString();

    for (const unit of aggregated.values()) {
      for (const cycle of unit.cycles) {
        if (!cycle.startDate || !cycle.endDate) {
          const ct: 'primary' | 'secondary' | null =
            cycle.cycleIndex === 1 ? 'secondary' : 'primary';
          unitsNeedingDates.push({
            cropName: cycle.cropName || unit.name,
            cycleType: ct,
            year: referenceYear,
          });
        }
      }
    }

    if (unitsNeedingDates.length > 0) {
      const cycleDatesMap = await this.resolveCycleDatesWithLLM(unitsNeedingDates);

      // Apply resolved dates to units
      for (const unit of aggregated.values()) {
        for (const cycle of unit.cycles) {
          if (!cycle.startDate || !cycle.endDate) {
            const ct = cycle.cycleIndex === 1 ? 'secondaria' : 'primaria';
            const cropKey = `${this.normalizeString(cycle.cropName || unit.name)}|${ct}`;
            const resolved = cycleDatesMap.get(cropKey);
            if (resolved) {
              if (!cycle.startDate) cycle.startDate = resolved.startDate;
              if (!cycle.endDate) cycle.endDate = resolved.endDate;
            }
          }
        }
        // Also update unit-level dates from cycle dates
        if (!unit.startDate && unit.cycles[0]?.startDate) {
          unit.startDate = unit.cycles[0].startDate;
        }
        if (!unit.endDate && unit.cycles[0]?.endDate) {
          unit.endDate = unit.cycles[0].endDate;
        }
      }
    }

    // Round areas to 4 decimal places
    for (const unit of aggregated.values()) {
      unit.areaHa = Math.round((unit.areaHa || 0) * 10000) / 10000;
      for (const alloc of unit.allocations) {
        alloc.areaHa = Math.round(alloc.areaHa * 10000) / 10000;
      }
    }

    const result = Array.from(aggregated.values());
    console.log(
      `ProductionUnitCsvAgent: Lombardia format - Extracted ${result.length} production units`,
    );

    return result;
  }

  /**
   * Extract production units from Piemonte format (deterministic, no LLM needed for mapping)
   * Format: Unita produttiva;Comune Istat;Comune Descrizione;Sezione;Foglio;Particella;...
   *
   * Groups by: Occupazione Suolo Uso Suolo Primario (crop) + Varieta + DATE (semina)
   */
  private async extractPiemonteFormat(rows: ParsedRow[]): Promise<ProductionUnitRaw[]> {
    const cols = PIEMONTE_COLUMN_MAPPING;
    const aggregated = new Map<string, ProductionUnitRaw>();

    // Collect unique crops for LLM identification
    const cropInputsMap = new Map<string, CropIdentificationInput>();

    for (const row of rows) {
      const occupazionePrimario = row[cols.occupazioneSuoloPrimario];

      // Skip rows without occupation or non-agricultural uses
      if (!occupazionePrimario || isPiemonteNonAgricultural(occupazionePrimario)) {
        continue;
      }

      // Parse crop info from [CODE] NAME format
      const cropName = this.resolvePiemonteCropName(
        occupazionePrimario,
        row[cols.usoPrimario] || null,
      );
      const cropCode = extractCropCode(occupazionePrimario);
      if (!cropName) {
        continue;
      }

      // Get area from Superficie Uso Suolo Primario (already in HA)
      const superficiePrimarioRaw = row[cols.superficiePrimario];
      const areaHa = parsePiemonteSuperficie(superficiePrimarioRaw);
      if (areaHa === null || areaHa <= 0) {
        continue;
      }

      // Get variety (clean bracket format)
      const varietaRaw = row[cols.varietaPrimario];
      const varieta =
        varietaRaw && varietaRaw !== '[000] -'
          ? varietaRaw.replace(/^\[\d+\]\s*/, '').trim() || null
          : null;

      // Get dates (DD/MM/YYYY format)
      const dataInizio = parsePiemonteDate(row[cols.dataInizioSeminaPrimario] || '');
      const dataFine = parsePiemonteDate(row[cols.dataFineSeminaPrimario] || '');

      const startDate = dataInizio;
      const endDate = dataFine;

      // Get cadastral info
      const sezione = row[cols.sezione]?.trim() || null;
      const foglio = row[cols.foglio]?.trim() || null;
      const particella = row[cols.particella]?.trim() || null;
      const subalterno = row[cols.subalterno]?.trim() || null;

      // Get comune
      const comuneDescrizione = row[cols.comuneDescrizione] || '';
      const { comune } = parseComuneDescrizione(comuneDescrizione);

      // Build aggregation key: Crop + Variety + Comune + Dates
      const cropNorm = this.normalizeString(cropName);
      const varietyNorm = varieta ? this.normalizeString(varieta) : '';
      const comuneNorm = this.normalizeString(comune);
      const key = `${cropNorm}|${varietyNorm}|${comuneNorm}|${startDate || 'no_start'}|${endDate || 'no_end'}`;

      // Collect crop for LLM identification
      const cropCacheKey = this.buildCropCacheKey(cropName, varieta);
      if (!cropInputsMap.has(cropCacheKey) && !this.cropCache.has(cropCacheKey)) {
        cropInputsMap.set(cropCacheKey, { cropName, variety: varieta });
      }

      // Get destinazione
      const destinazioneRaw = row[cols.destinazionePrimario];
      const destinazione =
        destinazioneRaw && destinazioneRaw !== '[000] -'
          ? destinazioneRaw.replace(/^\[\d+\]\s*/, '').trim() || null
          : null;

      // Get or create aggregated unit
      let unit = aggregated.get(key);
      if (!unit) {
        // Build unit name from crop + variety + comune
        const comuneLabel = comune ? ` (${comune})` : '';
        const unitDisplayName = varieta
          ? `${cropName} - ${varieta}${comuneLabel}`
          : `${cropName}${comuneLabel}`;

        // Create primary cycle
        const primaryCycle: ProductionCycleRaw = {
          cycleIndex: 0,
          cropName,
          cropType: cropName,
          cropCode,
          variety: varieta,
          occupazione: occupazionePrimario,
          destinazione,
          protectionStructure: row[cols.epocaSeminaPrimario]?.trim() || null,
          startDate,
          endDate,
          floweringDate: null,
          harvestingDate: null,
        };

        unit = {
          name: unitDisplayName,
          sezione,
          foglio,
          particella,
          subalterno,
          areaHa: 0,
          protocoll: 'PIEMONTE',
          startDate,
          endDate,
          cycles: [primaryCycle],
          allocations: [],
        };
        aggregated.set(key, unit);
      }

      // Build field name from comune + cadastral info
      const fieldName = `${comune} - F${foglio || '?'} P${particella || '?'}`;

      // Find or create allocation for this field
      let allocation = unit.allocations.find(
        (a) =>
          a.foglio === foglio &&
          a.particella === particella &&
          (a.sezione ?? '') === (sezione ?? ''),
      );
      if (!allocation) {
        allocation = {
          fieldName,
          sezione,
          foglio,
          particella,
          subalterno,
          areaHa: 0,
        };
        unit.allocations.push(allocation);
      }

      // Sum area
      allocation.areaHa += areaHa;
      unit.areaHa = (unit.areaHa || 0) + areaHa;

      // Set cadastral info from first allocation if not set
      if (!unit.sezione && sezione) unit.sezione = sezione;
      if (!unit.foglio && foglio) unit.foglio = foglio;
      if (!unit.particella && particella) unit.particella = particella;
      if (!unit.subalterno && subalterno) unit.subalterno = subalterno;

      // Extend date range
      if (startDate && (!unit.startDate || startDate < unit.startDate)) {
        unit.startDate = startDate;
      }
      if (endDate && (!unit.endDate || endDate > unit.endDate)) {
        unit.endDate = endDate;
      }
    }

    const cropInputs = Array.from(cropInputsMap.values());
    if (cropInputs.length > 0) {
      await this.identifyCropsWithLLM(cropInputs);
      await this.finalizeCropIdentification(aggregated);
    }

    // Round areas to 4 decimal places
    for (const unit of aggregated.values()) {
      unit.areaHa = Math.round((unit.areaHa || 0) * 10000) / 10000;
      for (const alloc of unit.allocations) {
        alloc.areaHa = Math.round(alloc.areaHa * 10000) / 10000;
      }
    }

    const result = Array.from(aggregated.values());
    console.log(
      `ProductionUnitCsvAgent: Piemonte format - Extracted ${result.length} production units`,
    );

    return result;
  }

  /**
   * Extract production units from Emilia-Romagna format (deterministic, no LLM needed for mapping)
   * Format: ID. DOMANDA;ANNO;...;FOGLIO ;PARTICELLA;SUBALTERNO;...;OCCUPAZIONE SUOLO;...
   *
   * Groups by: OCCUPAZIONE SUOLO (crop) + VARIETA + DATE
   */
  private async extractEmiliaRomagnaFormat(rows: ParsedRow[]): Promise<ProductionUnitRaw[]> {
    const cols = EMILIA_ROMAGNA_COLUMN_MAPPING;
    const aggregated = new Map<string, ProductionUnitRaw>();

    // Collect unique crops for LLM identification
    const cropInputsMap = new Map<string, CropIdentificationInput>();

    for (const row of rows) {
      const occupazioneSuolo = row[cols.occupazioneSuolo];

      // Skip rows without occupation or non-agricultural uses
      // FLAG SAU = 'N' is the authoritative AGEA indicator (covers BOSCO, USO FORESTALE, etc.)
      const flagSauValue = row[cols.flagSau]?.trim() ?? '';
      const isNonAgricultural =
        (flagSauValue !== '' && !isEmiliaRomagnaSauRow(flagSauValue)) ||
        isEmiliaRomagnaNonAgricultural(occupazioneSuolo);
      if (!occupazioneSuolo || isNonAgricultural) {
        continue;
      }

      // Parse crop info
      const cropName = parseEmiliaRomagnaUsoSuolo(occupazioneSuolo);
      if (!cropName) {
        continue;
      }

      // Get area (already in HA)
      const superficieRaw = row[cols.superficieHa];
      const areaHa = parseEmiliaRomagnaSuperficie(superficieRaw);
      if (areaHa === null || areaHa <= 0) {
        continue;
      }

      // Get variety
      const varieta = row[cols.varieta]?.trim() || null;

      // Get crop code
      const cropCode = row[cols.codColtura]?.trim() || null;

      // Get dates (DD-MM-YYYY format)
      const dataInizio = parseEmiliaRomagnaDate(row[cols.dataInizioUtilizzo] || '');
      const dataFine = parseEmiliaRomagnaDate(row[cols.dataFineUtilizzo] || '');

      const startDate = dataInizio;
      const endDate = dataFine;

      // Get cadastral info - NOTA: "FOGLIO " has trailing space
      let foglio = row[cols.foglio]?.trim() || null;
      if (!foglio) {
        foglio = row['FOGLIO']?.trim() || null;
      }
      const particella = row[cols.particella]?.trim() || null;
      const subalterno = row[cols.subalterno]?.trim() || null;

      // Get comune
      const comune = row[cols.comune]?.trim() || '';

      // Build aggregation key: Crop + Variety + Comune + Dates
      const cropNorm = this.normalizeString(cropName);
      const varietyNorm = varieta ? this.normalizeString(varieta) : '';
      const comuneNorm = this.normalizeString(comune);
      const key = `${cropNorm}|${varietyNorm}|${comuneNorm}|${startDate || 'no_start'}|${endDate || 'no_end'}`;

      // Collect crop for LLM identification
      const cropCacheKey = this.buildCropCacheKey(cropName, varieta);
      if (!cropInputsMap.has(cropCacheKey) && !this.cropCache.has(cropCacheKey)) {
        cropInputsMap.set(cropCacheKey, { cropName, variety: varieta });
      }

      // Get destinazione and uso
      const destinazione = row[cols.destinazione]?.trim() || null;
      const uso = row[cols.uso]?.trim() || null;

      // Get or create aggregated unit
      let unit = aggregated.get(key);
      if (!unit) {
        // Build unit name from crop + variety + comune
        const comuneLabel = comune ? ` (${comune})` : '';
        const unitDisplayName = varieta
          ? `${cropName} - ${varieta}${comuneLabel}`
          : `${cropName}${comuneLabel}`;

        // Create primary cycle
        const primaryCycle: ProductionCycleRaw = {
          cycleIndex: 0,
          cropName,
          cropType: cropName,
          cropCode,
          variety: varieta,
          occupazione: occupazioneSuolo,
          destinazione: destinazione || uso,
          protectionStructure: null,
          startDate,
          endDate,
          floweringDate: null,
          harvestingDate: null,
        };

        unit = {
          name: unitDisplayName,
          sezione: null, // Emilia-Romagna format doesn't have sezione
          foglio,
          particella,
          subalterno,
          areaHa: 0,
          protocoll: 'EMILIA_ROMAGNA',
          startDate,
          endDate,
          cycles: [primaryCycle],
          allocations: [],
        };
        aggregated.set(key, unit);
      }

      // Build field name from comune + cadastral info
      const fieldName = `${comune} - F${foglio || '?'} P${particella || '?'}`;

      // Find or create allocation for this field
      let allocation = unit.allocations.find(
        (a) => a.foglio === foglio && a.particella === particella,
      );
      if (!allocation) {
        allocation = {
          fieldName,
          sezione: null,
          foglio,
          particella,
          subalterno,
          areaHa: 0,
        };
        unit.allocations.push(allocation);
      }

      // Sum area
      allocation.areaHa += areaHa;
      unit.areaHa = (unit.areaHa || 0) + areaHa;

      // Set cadastral info from first allocation if not set
      if (!unit.foglio && foglio) unit.foglio = foglio;
      if (!unit.particella && particella) unit.particella = particella;
      if (!unit.subalterno && subalterno) unit.subalterno = subalterno;

      // Extend date range
      if (startDate && (!unit.startDate || startDate < unit.startDate)) {
        unit.startDate = startDate;
      }
      if (endDate && (!unit.endDate || endDate > unit.endDate)) {
        unit.endDate = endDate;
      }
    }

    const cropInputs = Array.from(cropInputsMap.values());
    if (cropInputs.length > 0) {
      await this.identifyCropsWithLLM(cropInputs);
      await this.finalizeCropIdentification(aggregated);
    }

    // Round areas to 4 decimal places
    for (const unit of aggregated.values()) {
      unit.areaHa = Math.round((unit.areaHa || 0) * 10000) / 10000;
      for (const alloc of unit.allocations) {
        alloc.areaHa = Math.round(alloc.areaHa * 10000) / 10000;
      }
    }

    const result = Array.from(aggregated.values());
    console.log(
      `ProductionUnitCsvAgent: Emilia-Romagna format - Extracted ${result.length} production units`,
    );

    return result;
  }

  /**
   * Extract production units from Veneto Standard format (deterministic, no LLM needed for mapping)
   * Uses the same SIAN/AGEA column structure as Piemonte but with Veneto-specific parsing.
   * Format: Unita produttiva;Comune Descrizione;Sezione;Foglio;Particella;...
   *
   * Groups by: Occupazione Suolo Uso Suolo Primario (crop) + Varieta + DATE (semina)
   */
  private async extractVenetoStandardFormat(rows: ParsedRow[]): Promise<ProductionUnitRaw[]> {
    const cols = VENETO_COLUMN_MAPPING;
    const aggregated = new Map<string, ProductionUnitRaw>();

    // Collect unique crops for LLM identification
    const cropInputsMap = new Map<string, CropIdentificationInput>();

    for (const row of rows) {
      const occupazionePrimario = row[cols.occupazioneSuoloPrimario];

      // Skip rows without occupation or non-agricultural uses
      if (!occupazionePrimario || isVenetoNonAgricultural(occupazionePrimario)) {
        continue;
      }

      // Parse crop info from occupation column
      const cropName = parseVenetoUsoSuolo(occupazionePrimario);
      if (!cropName) {
        continue;
      }

      // Get area from Superficie Uso Suolo Primario (already in HA)
      const superficiePrimarioRaw = row[cols.superficiePrimario];
      const areaHa = parseVenetoSuperficie(superficiePrimarioRaw);
      if (areaHa === null || areaHa <= 0) {
        continue;
      }

      // Get variety (clean bracket format)
      const varietaRaw = row[cols.varietaPrimario];
      const varieta =
        varietaRaw && varietaRaw !== '[000] -'
          ? varietaRaw.replace(/^\[\d+\]\s*/, '').trim() || null
          : null;

      // Get dates (DD/MM/YYYY format)
      const dataInizio = parseVenetoDate(row[cols.dataInizioSeminaPrimario] || '');
      const dataFine = parseVenetoDate(row[cols.dataFineSeminaPrimario] || '');

      const startDate = dataInizio;
      const endDate = dataFine;

      // Get cadastral info
      const sezione = row[cols.sezione]?.trim() || null;
      const foglio = row[cols.foglio]?.trim() || null;
      const particella = row[cols.particella]?.trim() || null;
      const subalterno = row[cols.subalterno]?.trim() || null;

      // Get comune
      const comuneDescrizione = row[cols.comuneDescrizione] || '';
      const { comune } = parseVenetoComuneDescrizione(comuneDescrizione);

      // Build aggregation key: Crop + Variety + Comune + Dates
      const cropNorm = this.normalizeString(cropName);
      const varietyNorm = varieta ? this.normalizeString(varieta) : '';
      const comuneNorm = this.normalizeString(comune);
      const key = `${cropNorm}|${varietyNorm}|${comuneNorm}|${startDate || 'no_start'}|${endDate || 'no_end'}`;

      // Collect crop for LLM identification
      const cropCacheKey = this.buildCropCacheKey(cropName, varieta);
      if (!cropInputsMap.has(cropCacheKey) && !this.cropCache.has(cropCacheKey)) {
        cropInputsMap.set(cropCacheKey, { cropName, variety: varieta });
      }

      // Get destinazione
      const destinazioneRaw = row[cols.destinazionePrimario];
      const destinazione =
        destinazioneRaw && destinazioneRaw !== '[000] -'
          ? destinazioneRaw.replace(/^\[\d+\]\s*/, '').trim() || null
          : null;

      // Get or create aggregated unit
      let unit = aggregated.get(key);
      if (!unit) {
        // Build unit name from crop + variety + comune
        const comuneLabel = comune ? ` (${comune})` : '';
        const unitDisplayName = varieta
          ? `${cropName} - ${varieta}${comuneLabel}`
          : `${cropName}${comuneLabel}`;

        // Create primary cycle
        const primaryCycle: ProductionCycleRaw = {
          cycleIndex: 0,
          cropName,
          cropType: cropName,
          cropCode: null,
          variety: varieta,
          occupazione: occupazionePrimario,
          destinazione,
          protectionStructure: row[cols.epocaSeminaPrimario]?.trim() || null,
          startDate,
          endDate,
          floweringDate: null,
          harvestingDate: null,
        };

        unit = {
          name: unitDisplayName,
          sezione,
          foglio,
          particella,
          subalterno,
          areaHa: 0,
          protocoll: 'VENETO',
          startDate,
          endDate,
          cycles: [primaryCycle],
          allocations: [],
        };
        aggregated.set(key, unit);
      }

      // Build field name from comune + cadastral info
      const fieldName = `${comune} - F${foglio || '?'} P${particella || '?'}`;

      // Find or create allocation for this field
      let allocation = unit.allocations.find(
        (a) =>
          a.foglio === foglio &&
          a.particella === particella &&
          (a.sezione ?? '') === (sezione ?? ''),
      );
      if (!allocation) {
        allocation = {
          fieldName,
          sezione,
          foglio,
          particella,
          subalterno,
          areaHa: 0,
        };
        unit.allocations.push(allocation);
      }

      // Sum area
      allocation.areaHa += areaHa;
      unit.areaHa = (unit.areaHa || 0) + areaHa;

      // Set cadastral info from first allocation if not set
      if (!unit.sezione && sezione) unit.sezione = sezione;
      if (!unit.foglio && foglio) unit.foglio = foglio;
      if (!unit.particella && particella) unit.particella = particella;
      if (!unit.subalterno && subalterno) unit.subalterno = subalterno;

      // Extend date range
      if (startDate && (!unit.startDate || startDate < unit.startDate)) {
        unit.startDate = startDate;
      }
      if (endDate && (!unit.endDate || endDate > unit.endDate)) {
        unit.endDate = endDate;
      }
    }

    const cropInputs = Array.from(cropInputsMap.values());
    if (cropInputs.length > 0) {
      await this.identifyCropsWithLLM(cropInputs);
      await this.finalizeCropIdentification(aggregated);
    }

    // Round areas to 4 decimal places
    for (const unit of aggregated.values()) {
      unit.areaHa = Math.round((unit.areaHa || 0) * 10000) / 10000;
      for (const alloc of unit.allocations) {
        alloc.areaHa = Math.round(alloc.areaHa * 10000) / 10000;
      }
    }

    const result = Array.from(aggregated.values());
    console.log(
      `ProductionUnitCsvAgent: Veneto Standard format - Extracted ${result.length} production units`,
    );

    return result;
  }

  /**
   * Extract production units from Veneto AVEPA "Piano Utilizzo" format
   *
   * This format:
   * - Has multi-row headers with title, year (Campagna), status in first rows
   * - Data columns start around row 22
   * - Uses PAC AGEA codes (e.g., 870-011-000-000-000) to identify crops
   * - Has columns: Comune, Sez, Fog., Part., Sub, Sup. Catastale, 1a Coltura, Sup. Utilizzata, etc.
   *
   * Groups by: Crop (from PAC code) + Variety + Dates
   */
  private async extractVenetoAVEPAFormat(
    rows: ParsedRow[],
    headers: string[],
  ): Promise<ProductionUnitRaw[]> {
    const aggregated = new Map<string, ProductionUnitRaw>();

    // Find PAC code column index
    const sampleRow = rows[0] ? Object.values(rows[0]) : [];
    const pacCodeColumnIndex = findPacCodeColumnIndex(headers, sampleRow as string[]);
    const pacCodeColumnName = headers[pacCodeColumnIndex] || '';

    // Find crop description column (usually 2 positions after "1a Coltura" header, which contains PAC codes)
    // The actual crop description text (e.g., "GRANTURCO (MAIS) - DA FORAGGIO") is in an unlabeled column
    const colturaHeaderIndex = headers.findIndex(
      (h) => h === '1a Coltura' || h === '1a coltura' || h === 'Prima Coltura',
    );
    const colturaDescColumnIndex = colturaHeaderIndex >= 0 ? colturaHeaderIndex + 2 : -1;
    const colturaDescColumnName =
      colturaDescColumnIndex >= 0 ? headers[colturaDescColumnIndex] || 'Column_24' : '';

    console.log(
      `ProductionUnitCsvAgent: AVEPA PAC code column: "${pacCodeColumnName}" at index ${pacCodeColumnIndex}`,
    );
    console.log(
      `ProductionUnitCsvAgent: AVEPA crop description column: "${colturaDescColumnName}" at index ${colturaDescColumnIndex}`,
    );

    // Collect unique PAC codes for batch interpretation
    const pacCodesSet = new Map<string, { pacCode: string; colturaDescription?: string }>();

    for (const row of rows) {
      // Try to find PAC code from known column or by pattern matching
      let pacCodeRaw: string | null = null;
      let colturaDescription: string | null = null;

      // First try the detected column
      if (pacCodeColumnName && row[pacCodeColumnName]) {
        pacCodeRaw = parsePacCodeFromColumn(row[pacCodeColumnName]);
      }

      // If not found, search all columns for PAC pattern
      if (!pacCodeRaw) {
        for (const value of Object.values(row)) {
          const parsed = parsePacCodeFromColumn(value);
          if (parsed) {
            pacCodeRaw = parsed;
            break;
          }
        }
      }

      // Get coltura description from the actual description column (offset +2 from "1a Coltura")
      // "1a Coltura" column itself contains PAC codes, the real description is 2 columns ahead
      if (colturaDescColumnName) {
        const descValue = row[colturaDescColumnName] || row['Column_24'] || '';
        if (descValue && !parsePacCodeFromColumn(descValue)) {
          const { name } = parsePrimaColturaColumn(descValue);
          colturaDescription = name;
        }
      }

      // Skip if no PAC code found
      if (!pacCodeRaw) continue;

      // Skip non-agricultural uses
      if (isNonAgriculturalPacCode(pacCodeRaw)) continue;

      // Collect for batch processing
      if (!pacCodesSet.has(pacCodeRaw)) {
        pacCodesSet.set(pacCodeRaw, {
          pacCode: pacCodeRaw,
          colturaDescription: colturaDescription || undefined,
        });
      }
    }

    // Batch interpret PAC codes
    const pacCodesArray = Array.from(pacCodesSet.values());
    console.log(`ProductionUnitCsvAgent: Interpreting ${pacCodesArray.length} unique PAC codes`);

    const pacInterpretations = await batchInterpretPacCodes(pacCodesArray);

    // Process rows
    for (const row of rows) {
      // Find PAC code
      let pacCodeRaw: string | null = null;
      if (pacCodeColumnName && row[pacCodeColumnName]) {
        pacCodeRaw = parsePacCodeFromColumn(row[pacCodeColumnName]);
      }
      if (!pacCodeRaw) {
        for (const value of Object.values(row)) {
          const parsed = parsePacCodeFromColumn(value);
          if (parsed) {
            pacCodeRaw = parsed;
            break;
          }
        }
      }

      if (!pacCodeRaw) continue;

      // Skip non-agricultural
      if (isNonAgriculturalPacCode(pacCodeRaw)) continue;

      // Get crop interpretation
      const pacParsed = parsePacCodeString(pacCodeRaw);
      const cropInfo = pacParsed ? pacInterpretations.get(pacParsed.full) : null;

      if (!cropInfo || !cropInfo.isAgricultural) continue;

      // Get area from "Sup. Utilizzata" or "Sup. Catastale"
      const supUtilizzata = row['Sup. Utilizzata'] || row['sup. utilizzata'] || '';
      const supCatastale = row['Sup. Catastale'] || row['sup. catastale'] || '';
      const areaHa = parseAVEPASuperficie(supUtilizzata) || parseAVEPASuperficie(supCatastale);

      if (areaHa === null || areaHa <= 0) continue;

      // Get cadastral info
      const comune = row['Comune'] || row['comune'] || '';
      const sezione = (row['Sez'] || row['sez'] || row['Sezione'] || '').trim() || null;
      const foglio = (row['Fog.'] || row['fog.'] || row['Foglio'] || '').trim() || null;
      const particella = (row['Part.'] || row['part.'] || row['Particella'] || '').trim() || null;
      const subalterno = (row['Sub'] || row['sub'] || row['Subalterno'] || '').trim() || null;

      // Parse comune
      const { comune: comuneName } = parseVenetoComuneDescrizione(comune);

      // Get coltura info
      const cropName = cropInfo.cropType;
      const variety = cropInfo.variety;
      const cropCode = cropInfo.code;

      // Build aggregation key: Crop + Variety + Comune
      const cropNorm = this.normalizeString(cropName);
      const varietyNorm = variety ? this.normalizeString(variety) : '';
      const comuneNorm = this.normalizeString(comuneName);
      const key = `${cropNorm}|${varietyNorm}|${comuneNorm}`;

      // Get or create aggregated unit
      let unit = aggregated.get(key);
      if (!unit) {
        const comuneLabel = comuneName ? ` (${comuneName})` : '';
        const unitDisplayName = variety
          ? `${cropName} - ${variety}${comuneLabel}`
          : `${cropName}${comuneLabel}`;

        // Create primary cycle
        const primaryCycle: ProductionCycleRaw = {
          cycleIndex: 0,
          cropName: cropInfo.species,
          cropType: cropName,
          cropCode,
          variety,
          occupazione: pacCodeRaw,
          destinazione: null,
          protectionStructure: null,
          startDate: null,
          endDate: null,
          floweringDate: null,
          harvestingDate: null,
        };

        unit = {
          name: unitDisplayName,
          sezione,
          foglio,
          particella,
          subalterno,
          areaHa: 0,
          protocoll: 'VENETO_AVEPA',
          startDate: null,
          endDate: null,
          cycles: [primaryCycle],
          allocations: [],
        };
        aggregated.set(key, unit);
      }

      // Build field name
      const fieldName = `${comuneName} - F${foglio || '?'} P${particella || '?'}`;

      // Find or create allocation for this field
      let allocation = unit.allocations.find(
        (a) =>
          a.foglio === foglio &&
          a.particella === particella &&
          (a.sezione ?? '') === (sezione ?? ''),
      );
      if (!allocation) {
        allocation = {
          fieldName,
          sezione,
          foglio,
          particella,
          subalterno,
          areaHa: 0,
        };
        unit.allocations.push(allocation);
      }

      // Sum area
      allocation.areaHa += areaHa;
      unit.areaHa = (unit.areaHa || 0) + areaHa;

      // Set cadastral info from first allocation if not set
      if (!unit.sezione && sezione) unit.sezione = sezione;
      if (!unit.foglio && foglio) unit.foglio = foglio;
      if (!unit.particella && particella) unit.particella = particella;
      if (!unit.subalterno && subalterno) unit.subalterno = subalterno;
    }

    // Round areas to 4 decimal places
    for (const unit of aggregated.values()) {
      unit.areaHa = Math.round((unit.areaHa || 0) * 10000) / 10000;
      for (const alloc of unit.allocations) {
        alloc.areaHa = Math.round(alloc.areaHa * 10000) / 10000;
      }
    }

    const result = Array.from(aggregated.values());
    console.log(
      `ProductionUnitCsvAgent: Veneto AVEPA format - Extracted ${result.length} production units`,
    );

    return result;
  }

  /**
   * Extract production units from CIA Schedario Viticolo format (deterministic, no LLM needed for mapping)
   *
   * This format is a vineyard cadastral registry from CIA (old B1).
   * Each row is a UNAR (sub-unit) with a specific grape variety.
   * Production units are grouped by grape variety (DESCRIZIONE VITIGNO).
   * All rows are vineyard land (Vite / Vitis vinifera).
   * Surfaces are in MQ (square meters).
   */
  private async extractCiaSchedarioViticoloFormat(rows: ParsedRow[]): Promise<ProductionUnitRaw[]> {
    const cols = CIA_SCHEDARIO_VITICOLO_COLUMN_MAPPING;
    const aggregated = new Map<string, ProductionUnitRaw>();

    // Collect unique grape varieties for LLM identification
    const cropInputsMap = new Map<string, CropIdentificationInput>();

    for (const row of rows) {
      const descrizioneVitigno = (row[cols.descrizioneVitigno] || '').trim();

      // Skip rows without grape variety
      if (!descrizioneVitigno) {
        continue;
      }

      // Parse grape variety name
      const { name: vitignoName, colorCode } = normalizeVitignoName(descrizioneVitigno);
      if (!vitignoName) {
        continue;
      }

      // Get area from SUP. VITATA DICHIARATA (in MQ)
      const supVitataMq = parseCiaNumber(row[cols.supVitataDichiarata]);
      if (supVitataMq === null || supVitataMq <= 0) {
        continue;
      }
      const areaHa = supVitataMq / 10000;

      // Build crop name: "Vite" is the crop, grape variety is the variety
      const cropName = 'Vite';
      const variety = vitignoName;

      // Get cadastral info
      const sezione = (row[cols.sezione] || '').trim() || null;
      const foglio = (row[cols.foglio] || '').trim() || null;
      const particella = (row[cols.particella] || '').trim() || null;

      // Get comune for field naming and aggregation
      const comune = (row[cols.comune] || '').trim();

      // Build aggregation key: Grape variety + Comune
      const varietyNorm = this.normalizeString(variety);
      const comuneNorm = this.normalizeString(comune);
      const key = `${varietyNorm}|${comuneNorm}`;

      // Collect crop for LLM identification (grape variety as variety of Vite)
      const cropCacheKey = this.buildCropCacheKey(cropName, variety);
      if (!cropInputsMap.has(cropCacheKey) && !this.cropCache.has(cropCacheKey)) {
        cropInputsMap.set(cropCacheKey, { cropName, variety });
      }

      // Get additional info
      const formaAllevamento = (row[cols.formaAllevamento] || '').trim() || null;
      const annoImpianto = (row[cols.annoImpianto] || '').trim() || null;

      // Get or create aggregated unit
      let unit = aggregated.get(key);
      if (!unit) {
        // Build display name
        const colorSuffix = colorCode ? ` (${colorCode})` : '';
        const comuneLabel = comune ? ` (${comune})` : '';
        const unitDisplayName = `Vite - ${variety}${colorSuffix}${comuneLabel}`;

        // Create primary cycle
        const primaryCycle: ProductionCycleRaw = {
          cycleIndex: 0,
          cropName: 'Vitis vinifera',
          cropType: 'vite',
          cropCode: null,
          variety,
          occupazione: `Vite - ${descrizioneVitigno}`,
          destinazione: formaAllevamento,
          protectionStructure: null,
          startDate: null,
          endDate: null,
          floweringDate: null,
          harvestingDate: null,
        };

        unit = {
          name: unitDisplayName,
          sezione,
          foglio,
          particella,
          subalterno: null,
          areaHa: 0,
          protocoll: 'CIA_SCHEDARIO_VITICOLO',
          startDate: annoImpianto ? `${annoImpianto}-01-01` : null,
          endDate: null,
          cycles: [primaryCycle],
          allocations: [],
        };
        aggregated.set(key, unit);
      }

      // Build field name from comune + cadastral info
      const fieldName = `${comune} - F${foglio || '?'} P${particella || '?'}`;

      // Find or create allocation for this field
      let allocation = unit.allocations.find(
        (a) =>
          a.foglio === foglio &&
          a.particella === particella &&
          (a.sezione ?? '') === (sezione ?? ''),
      );
      if (!allocation) {
        allocation = {
          fieldName,
          sezione,
          foglio,
          particella,
          subalterno: null,
          areaHa: 0,
        };
        unit.allocations.push(allocation);
      }

      // Sum area
      allocation.areaHa += areaHa;
      unit.areaHa = (unit.areaHa || 0) + areaHa;

      // Set cadastral info from first allocation if not set
      if (!unit.sezione && sezione) unit.sezione = sezione;
      if (!unit.foglio && foglio) unit.foglio = foglio;
      if (!unit.particella && particella) unit.particella = particella;
    }

    const cropInputs = Array.from(cropInputsMap.values());
    if (cropInputs.length > 0) {
      await this.identifyCropsWithLLM(cropInputs);
      await this.finalizeCropIdentification(aggregated);
    }

    // Round areas to 4 decimal places
    for (const unit of aggregated.values()) {
      unit.areaHa = Math.round((unit.areaHa || 0) * 10000) / 10000;
      for (const alloc of unit.allocations) {
        alloc.areaHa = Math.round(alloc.areaHa * 10000) / 10000;
      }
    }

    const result = Array.from(aggregated.values());
    console.log(
      `ProductionUnitCsvAgent: CIA Schedario Viticolo format - Extracted ${result.length} production units`,
    );

    return result;
  }

  /**
   * Full LLM extraction fallback for production units.
   * Used when deterministic parsing (both regional templates and LLM column mapping)
   * produces 0 results. Sends headers + first 50 rows directly to LLM.
   */
  private async extractProductionUnitsWithLLM(csvContent: string): Promise<ProductionUnitRaw[]> {
    const lines = csvContent.split('\n').filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      return [];
    }

    // Take header + first 50 rows for LLM analysis
    const sampleLines = lines.slice(0, Math.min(51, lines.length));
    const sampleContent = sampleLines.join('\n');

    console.log(
      `ProductionUnitCsvAgent: Using full LLM extraction on ${sampleLines.length - 1} sample rows`,
    );

    const LLMProductionUnitSchema = z.object({
      units: z.array(
        z.object({
          name: z.string().describe('Nome unità produttiva (es. "Frumento tenero - Bolero")'),
          cropName: z
            .string()
            .describe('Nome coltura in italiano (es. "Frumento tenero", "Vite", "Melo")'),
          cropType: z
            .string()
            .nullable()
            .describe('Tipo/destinazione coltura (es. "seminativo", "frutticolo")'),
          variety: z.string().nullable().describe('Varietà (es. "Bolero", "Golden Delicious")'),
          startDate: z.string().nullable().describe('Data inizio in formato YYYY-MM-DD'),
          endDate: z.string().nullable().describe('Data fine in formato YYYY-MM-DD'),
          allocations: z.array(
            z.object({
              fieldName: z.string().describe('Nome campo (es. "Comune - F10 P23")'),
              sezione: z.string().nullable().describe('Sezione catastale'),
              foglio: z.string().nullable().describe('Foglio catastale'),
              particella: z.string().nullable().describe('Particella catastale'),
              areaHa: z.number().describe('Superficie in ettari'),
            }),
          ),
        }),
      ),
    });

    const usageAccumulator = new UsageAccumulator();
    const usageCollector = new LangChainUsageCollector(usageAccumulator);
    const extractor = this.getModel().withStructuredOutput(LLMProductionUnitSchema);

    const llmMessages = [
      {
        role: 'system' as const,
        content: `Sei un esperto di dati agricoli italiani. Estrai le unità produttive dal CSV fornito.

OBIETTIVO: Raggruppare le righe per COLTURA (crop) + VARIETÀ + DATE per creare unità produttive.

REGOLE:
1. **Raggruppamento**: Righe con la stessa coltura, varietà e periodo → UNA unità produttiva
2. **Allocazioni**: Ogni riga contribuisce un'allocazione (campo) con dati catastali e superficie
3. **Superfici**: Converti in ettari (HA). Se valori > 1000, probabilmente sono in MQ (dividi per 10000)
4. **Date**: Converti in formato YYYY-MM-DD. Gestisci formati DD/MM/YYYY, DD-MM-YYYY, timestamp
5. **Coltura**: Identifica la coltura dalla colonna più rilevante (es. "Occupazione Suolo", "Coltura", "Tipo Utilizzo")
6. **Dati catastali**: Estrai foglio, particella, sezione se presenti
7. **Nome**: Crea nome come "NomeColtura - Varietà" (es. "Frumento tenero - Bolero")
8. **Non-agricolo**: ESCLUDI righe con uso non agricolo (fabbricati, tare, manufatti)

FORMATI COLONNE COMUNI:
- "[003] COLZA" → coltura = "COLZA"
- "870-011-000-000-000" → codice PAC AGEA
- "FRUMENTO TENERO" → coltura diretta
- Superfici: "1,2345" (formato italiano) o "1.2345" (formato standard)

IMPORTANTE:
- Se non trovi dati catastali (foglio/particella), usa il nome del campo o riga come fieldName
- Raggruppa per coltura: stessa coltura+varietà+date = UNICA unità con multiple allocazioni
- Gestisci il formato numerico italiano (virgola come separatore decimale)`,
      },
      {
        role: 'user' as const,
        content: `Estrai le unità produttive da questo CSV:\n\n${sampleContent}`,
      },
    ];

    const result = await invokeLLMWithRetry(
      (msgs, opts) => extractor.invoke(msgs, opts),
      llmMessages,
      { callbacks: [usageCollector] },
      { maxRetries: 2, timeoutMs: 60_000 },
    );

    // Log usage asynchronously
    usageLogger
      .logFromAccumulator(usageAccumulator, {
        jobType: LlmJobType.CSV_IMPORT,
        model: 'gpt-4o-mini',
        metadata: { step: 'production-unit-full-llm-extraction', rowsSampled: sampleLines.length },
      })
      .catch((err) =>
        console.warn('[PRODUCTION-UNIT-CSV] Failed to log full extraction usage:', err),
      );

    // Convert LLM output to ProductionUnitRaw[]
    const units: ProductionUnitRaw[] = result.units.map((llmUnit) => {
      const primaryCycle: ProductionCycleRaw = {
        cycleIndex: 0,
        cropName: llmUnit.cropName,
        cropType: llmUnit.cropType,
        cropCode: null,
        variety: llmUnit.variety,
        occupazione: llmUnit.cropName,
        destinazione: llmUnit.cropType,
        protectionStructure: null,
        startDate: llmUnit.startDate,
        endDate: llmUnit.endDate,
        floweringDate: null,
        harvestingDate: null,
      };

      const allocations = llmUnit.allocations.map((alloc) => ({
        fieldName: alloc.fieldName,
        sezione: alloc.sezione,
        foglio: alloc.foglio,
        particella: alloc.particella,
        subalterno: null,
        areaHa: alloc.areaHa,
      }));

      const totalAreaHa = allocations.reduce((sum, a) => sum + a.areaHa, 0);

      return {
        name: llmUnit.name,
        sezione: allocations[0]?.sezione ?? null,
        foglio: allocations[0]?.foglio ?? null,
        particella: allocations[0]?.particella ?? null,
        subalterno: null,
        areaHa: Math.round(totalAreaHa * 10000) / 10000,
        protocoll: 'LLM_EXTRACTED',
        startDate: llmUnit.startDate,
        endDate: llmUnit.endDate,
        cycles: [primaryCycle],
        allocations,
      };
    });

    console.log(
      `ProductionUnitCsvAgent: Full LLM extraction produced ${units.length} production units`,
    );

    return units;
  }

  /**
   * Resolve missing cycle dates using LLM based on crop name and cycle type (Primaria/Secondaria).
   * Returns a map from "cropName|cycleType" to { startDate, endDate }.
   * Falls back to generic defaults (jan-jun / jul-dec) on LLM failure.
   */
  private async resolveCycleDatesWithLLM(
    inputs: Array<{ cropName: string; cycleType: 'primary' | 'secondary' | null; year: string }>,
  ): Promise<Map<string, { startDate: string; endDate: string }>> {
    const result = new Map<string, { startDate: string; endDate: string }>();

    // Deduplicate by cropName + cycleType
    const uniqueInputs = new Map<string, { cropName: string; cycleType: string; year: string }>();
    for (const input of inputs) {
      const ct = input.cycleType === 'secondary' ? 'secondaria' : 'primaria';
      const key = `${this.normalizeString(input.cropName)}|${ct}`;
      if (!uniqueInputs.has(key)) {
        uniqueInputs.set(key, { cropName: input.cropName, cycleType: ct, year: input.year });
      }
    }

    if (uniqueInputs.size === 0) return result;

    const toResolve = Array.from(uniqueInputs.values());

    const CycleDatesSchema = z.object({
      cycles: z.array(
        z.object({
          cropName: z.string().describe('The crop name as provided'),
          cycleType: z.string().describe('primaria or secondaria'),
          startMonth: z
            .number()
            .min(1)
            .max(12)
            .describe('Typical sowing/start month (1-12) for this crop in Italy'),
          endMonth: z
            .number()
            .min(1)
            .max(12)
            .describe('Typical harvest/end month (1-12) for this crop in Italy'),
        }),
      ),
    });

    try {
      const datesUsageAccumulator = new UsageAccumulator();
      const datesUsageCollector = new LangChainUsageCollector(datesUsageAccumulator);
      const extractor = this.getModel().withStructuredOutput(CycleDatesSchema);

      const messages = [
        {
          role: 'system' as const,
          content: `You are an Italian agricultural expert. For each crop and cycle type (primaria/secondaria), provide the typical sowing/start month and harvest/end month in Italy.

Rules:
- "Primaria" is the main crop of the year (typically spring-summer)
- "Secondaria" is the secondary crop, planted after the primary harvest (typically summer-autumn)
- Return month numbers (1=January, 12=December)
- Consider typical Italian agricultural calendars
- For perennial crops (vite, olivo, fruttiferi), use the full growing season

Examples:
- Mais primaria: start=3 (March), end=9 (September)
- Sorgo secondaria: start=6 (June), end=10 (October)
- Frumento tenero primaria: start=10 (October previous year → treat as 1 January), end=7 (July)
- Soia secondaria: start=6 (June), end=10 (October)`,
        },
        {
          role: 'user' as const,
          content: `Provide typical cycle dates for these crops:\n${toResolve
            .map((input, i) => `${i + 1}. "${input.cropName}" - ${input.cycleType}`)
            .join('\n')}`,
        },
      ];

      const llmResult = await invokeLLMWithRetry(
        (msgs, opts) => extractor.invoke(msgs, opts),
        messages,
        { callbacks: [datesUsageCollector] },
        { maxRetries: 2, timeoutMs: 30_000 },
      );

      // Log usage asynchronously
      usageLogger
        .logFromAccumulator(datesUsageAccumulator, {
          jobType: LlmJobType.CSV_IMPORT,
          model: 'gpt-4o-mini',
          metadata: {
            step: 'production-unit-cycle-dates',
            cropCount: toResolve.length,
          },
        })
        .catch((err) =>
          console.warn('[PRODUCTION-UNIT-CSV] Failed to log cycle dates usage:', err),
        );

      // Map results
      for (let i = 0; i < llmResult.cycles.length && i < toResolve.length; i++) {
        const cycle = llmResult.cycles[i];
        const input = toResolve[i];
        const key = `${this.normalizeString(input.cropName)}|${input.cycleType}`;
        const startDay = '01';
        const endDay = new Date(parseInt(input.year), cycle.endMonth, 0)
          .getDate()
          .toString()
          .padStart(2, '0');
        result.set(key, {
          startDate: `${input.year}-${cycle.startMonth.toString().padStart(2, '0')}-${startDay}`,
          endDate: `${input.year}-${cycle.endMonth.toString().padStart(2, '0')}-${endDay}`,
        });
      }

      console.log(
        `ProductionUnitCsvAgent: LLM resolved cycle dates for ${result.size} crop/cycle combinations`,
      );
    } catch (err) {
      console.warn(
        `ProductionUnitCsvAgent: LLM cycle date resolution failed, using defaults:`,
        err,
      );

      // Fallback to generic defaults
      for (const input of toResolve) {
        const key = `${this.normalizeString(input.cropName)}|${input.cycleType}`;
        if (input.cycleType === 'secondaria') {
          result.set(key, {
            startDate: `${input.year}-07-01`,
            endDate: `${input.year}-12-31`,
          });
        } else {
          result.set(key, {
            startDate: `${input.year}-01-01`,
            endDate: `${input.year}-06-30`,
          });
        }
      }
    }

    return result;
  }

  /**
   * Get LLM model instance
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

  private resolvePiemonteCropName(
    occupazionePrimario: string | null,
    usoPrimario: string | null,
  ): string | null {
    const occupazioneName = occupazionePrimario ? parsePiemonteUsoSuolo(occupazionePrimario) : null;
    const usoPrimarioName = this.cleanBracketValue(usoPrimario);
    if (!occupazioneName) {
      return usoPrimarioName;
    }
    if (this.isGenericOccupazione(occupazioneName)) {
      return usoPrimarioName ?? occupazioneName;
    }
    return occupazioneName;
  }

  private isGenericOccupazione(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return (
      normalized.includes('coltura principale') ||
      normalized.includes('coltura secondaria') ||
      normalized.includes('coltura secondarie')
    );
  }
}
