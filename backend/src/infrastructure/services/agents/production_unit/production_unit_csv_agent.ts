import type { ChatOpenAI } from '@langchain/openai';
import { type ParsedRow } from '../file_agent/utils/csv_parser';
import { type CropCatalogEntry } from '../../extraction/production-unit-normalizer';
import { CropIdentification, CropIdentificationInput, ColumnMapping, ProductionUnitRaw, ProductionUnitExtractionResult } from './production_unit_csv_agent.support';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';
import { productionUnitCsvAgentApplyCropCacheToUnits } from './production-unit-csv-agent.01-apply-crop-cache-to-units';
import { productionUnitCsvAgentCollectUnresolvedCropInputs } from './production-unit-csv-agent.02-collect-unresolved-crop-inputs';
import { productionUnitCsvAgentFinalizeCropIdentification } from './production-unit-csv-agent.03-finalize-crop-identification';
import { productionUnitCsvAgentExtractProductionUnitsFromCsv } from './production-unit-csv-agent.04-extract-production-units-from-csv';
import { productionUnitCsvAgentCollectUniqueCropInputs } from './production-unit-csv-agent.05-collect-unique-crop-inputs';
import { productionUnitCsvAgentBuildCropCacheKey } from './production-unit-csv-agent.06-build-crop-cache-key';
import { productionUnitCsvAgentBufferToCsv } from './production-unit-csv-agent.07-buffer-to-csv';
import { productionUnitCsvAgentParseCsv } from './production-unit-csv-agent.08-parse-csv';
import { productionUnitCsvAgentGetColumnMapping } from './production-unit-csv-agent.09-get-column-mapping';
import { productionUnitCsvAgentExtractAgeaFormat } from './production-unit-csv-agent.10-extract-agea-format';
import { productionUnitCsvAgentExtractLegacyFormat } from './production-unit-csv-agent.11-extract-legacy-format';
import { productionUnitCsvAgentParseOccupazione } from './production-unit-csv-agent.12-parse-occupazione';
import { productionUnitCsvAgentCleanBracketValue } from './production-unit-csv-agent.13-clean-bracket-value';
import { productionUnitCsvAgentGetValue } from './production-unit-csv-agent.14-get-value';
import { productionUnitCsvAgentParseNumber } from './production-unit-csv-agent.15-parse-number';
import { productionUnitCsvAgentParseDate } from './production-unit-csv-agent.16-parse-date';
import { productionUnitCsvAgentNormalizeString } from './production-unit-csv-agent.17-normalize-string';
import { productionUnitCsvAgentIdentifyCropsWithLLM } from './production-unit-csv-agent.18-identify-crops-with-llm';
import { productionUnitCsvAgentGetCropIdentification } from './production-unit-csv-agent.19-get-crop-identification';
import { productionUnitCsvAgentExtractLombardiaFormat } from './production-unit-csv-agent.20-extract-lombardia-format';
import { productionUnitCsvAgentExtractPiemonteFormat } from './production-unit-csv-agent.21-extract-piemonte-format';
import { productionUnitCsvAgentExtractEmiliaRomagnaFormat } from './production-unit-csv-agent.22-extract-emilia-romagna-format';
import { productionUnitCsvAgentExtractVenetoStandardFormat } from './production-unit-csv-agent.23-extract-veneto-standard-format';
import { productionUnitCsvAgentExtractVenetoAVEPAFormat } from './production-unit-csv-agent.24-extract-veneto-avepaformat';
import { productionUnitCsvAgentExtractCiaSchedarioViticoloFormat } from './production-unit-csv-agent.25-extract-cia-schedario-viticolo-format';
import { productionUnitCsvAgentExtractProductionUnitsWithLLM } from './production-unit-csv-agent.26-extract-production-units-with-llm';
import { productionUnitCsvAgentResolveCycleDatesWithLLM } from './production-unit-csv-agent.27-resolve-cycle-dates-with-llm';
import { productionUnitCsvAgentGetModel } from './production-unit-csv-agent.28-get-model';
import { productionUnitCsvAgentResolvePiemonteCropName } from './production-unit-csv-agent.29-resolve-piemonte-crop-name';
import { productionUnitCsvAgentIsGenericOccupazione } from './production-unit-csv-agent.30-is-generic-occupazione';

export { type ColumnMapping, type ProductionCycleRaw, type ProductionUnitRaw, type ProductionUnitExtractionResult } from './production_unit_csv_agent.support';

/**
 * Agent for extracting production units from CSV files.
 * Uses a two-phase approach:
 * 1. LLM phase: Analyze headers and sample rows to determine column mapping and format
 * 2. Deterministic phase: Parse all rows using the mapping, aggregate by occupation+dates
 */
export class ProductionUnitCsvAgent {

  model: ChatOpenAI | null = null;
  cropCache: Map<string, CropIdentification> = new Map();
  cropCatalogCache: CropCatalogEntry[] | null = null;

  applyCropCacheToUnits(aggregated: Map<string, ProductionUnitRaw>): void {
    productionUnitCsvAgentApplyCropCacheToUnits.call(this as unknown as ProductionUnitCsvAgentContext, aggregated);
  }

  collectUnresolvedCropInputs(
    aggregated: Map<string, ProductionUnitRaw>,
  ): CropIdentificationInput[] {
    return productionUnitCsvAgentCollectUnresolvedCropInputs.call(this as unknown as ProductionUnitCsvAgentContext, aggregated);
  }

  async finalizeCropIdentification(
    aggregated: Map<string, ProductionUnitRaw>,
  ): Promise<void> {
    return productionUnitCsvAgentFinalizeCropIdentification.call(this as unknown as ProductionUnitCsvAgentContext, aggregated);
  }

  /**
   * Extract production units from CSV/Excel buffer.
   * Returns both the extracted units and diagnostics about the extraction process.
   */
  async extractProductionUnitsFromCsv(fileBuffer: Buffer): Promise<ProductionUnitExtractionResult> {
    return productionUnitCsvAgentExtractProductionUnitsFromCsv.call(this as unknown as ProductionUnitCsvAgentContext, fileBuffer);
  }

  /**
   * Collect unique crop+variety combinations from all rows for batch LLM identification
   */
  collectUniqueCropInputs(
    rows: ParsedRow[],
    mapping: ColumnMapping,
  ): CropIdentificationInput[] {
    return productionUnitCsvAgentCollectUniqueCropInputs.call(this as unknown as ProductionUnitCsvAgentContext, rows, mapping);
  }

  /**
   * Build cache key from crop name and variety
   */
  buildCropCacheKey(cropName: string, variety: string | null): string {
    return productionUnitCsvAgentBuildCropCacheKey.call(this as unknown as ProductionUnitCsvAgentContext, cropName, variety);
  }

  // CSV parsing, file conversion – delegated to csv_parser.ts
  bufferToCsv(buffer: Buffer): string {
    return productionUnitCsvAgentBufferToCsv.call(this as unknown as ProductionUnitCsvAgentContext, buffer);
  }

  parseCsv(content: string): { headers: string[]; rows: ParsedRow[] } {
    return productionUnitCsvAgentParseCsv.call(this as unknown as ProductionUnitCsvAgentContext, content);
  }

  /**
   * Get column mapping from LLM
   */
  async getColumnMapping(
    headers: string[],
    sampleRows: ParsedRow[],
  ): Promise<ColumnMapping> {
    return productionUnitCsvAgentGetColumnMapping.call(this as unknown as ProductionUnitCsvAgentContext, headers, sampleRows);
  }

  /**
   * Extract production units from AGEA/SIAN format
   * Groups by: Occupazione Suolo Uso Suolo Primario + Varietà Uso Suolo Primario + Date Primarie
   * Includes primary cycle and secondary cycle (if dates are present)
   */
  extractAgeaFormat(rows: ParsedRow[], mapping: ColumnMapping): ProductionUnitRaw[] {
    return productionUnitCsvAgentExtractAgeaFormat.call(this as unknown as ProductionUnitCsvAgentContext, rows, mapping);
  }

  /**
   * Extract production units from legacy format
   * Groups by cropName + variety + dates
   */
  extractLegacyFormat(rows: ParsedRow[], mapping: ColumnMapping): ProductionUnitRaw[] {
    return productionUnitCsvAgentExtractLegacyFormat.call(this as unknown as ProductionUnitCsvAgentContext, rows, mapping);
  }

  // Value helpers – delegated to csv_parser.ts
  parseOccupazione(value: string): { code: string | null; name: string | null } {
    return productionUnitCsvAgentParseOccupazione.call(this as unknown as ProductionUnitCsvAgentContext, value);
  }

  cleanBracketValue(value: string | null): string | null {
    return productionUnitCsvAgentCleanBracketValue.call(this as unknown as ProductionUnitCsvAgentContext, value);
  }

  getValue(row: ParsedRow, colName: string | null): string | null {
    return productionUnitCsvAgentGetValue.call(this as unknown as ProductionUnitCsvAgentContext, row, colName);
  }

  parseNumber(value: string | null): number | null {
    return productionUnitCsvAgentParseNumber.call(this as unknown as ProductionUnitCsvAgentContext, value);
  }

  parseDate(value: string | null): string | null {
    return productionUnitCsvAgentParseDate.call(this as unknown as ProductionUnitCsvAgentContext, value);
  }

  normalizeString(value: string): string {
    return productionUnitCsvAgentNormalizeString.call(this as unknown as ProductionUnitCsvAgentContext, value);
  }

  /**
   * Identify crops using LLM in batch for efficiency
   * Called after initial extraction to resolve all unique crop+variety combinations
   */
  async identifyCropsWithLLM(cropInputs: CropIdentificationInput[]): Promise<void> {
    return productionUnitCsvAgentIdentifyCropsWithLLM.call(this as unknown as ProductionUnitCsvAgentContext, cropInputs);
  }

  /**
   * Get crop identification from cache, with fallback
   */
  getCropIdentification(
    cropName: string,
    variety: string | null,
  ): {
    cropName: string | null;
    cropType: string | null;
    code: string | null;
    variety: string | null;
  } {
    return productionUnitCsvAgentGetCropIdentification.call(this as unknown as ProductionUnitCsvAgentContext, cropName, variety);
  }

  /**
   * Extract production units from Lombardia format (deterministic, no LLM needed for mapping)
   * Format: CUAA;SUPERO;COMUNE;PROV;SEZ CENS;FOGLIO;MAPPALE;SUB;COLTIVAZIONE;TIPO UTILIZZO;...
   *
   * Groups by: TIPO UTILIZZO (crop) + VARIETA + DATE (semina/raccolta)
   */
  async extractLombardiaFormat(rows: ParsedRow[]): Promise<ProductionUnitRaw[]> {
    return productionUnitCsvAgentExtractLombardiaFormat.call(this as unknown as ProductionUnitCsvAgentContext, rows);
  }

  /**
   * Extract production units from Piemonte format (deterministic, no LLM needed for mapping)
   * Format: Unita produttiva;Comune Istat;Comune Descrizione;Sezione;Foglio;Particella;...
   *
   * Groups by: Occupazione Suolo Uso Suolo Primario (crop) + Varieta + DATE (semina)
   */
  async extractPiemonteFormat(rows: ParsedRow[]): Promise<ProductionUnitRaw[]> {
    return productionUnitCsvAgentExtractPiemonteFormat.call(this as unknown as ProductionUnitCsvAgentContext, rows);
  }

  /**
   * Extract production units from Emilia-Romagna format (deterministic, no LLM needed for mapping)
   * Format: ID. DOMANDA;ANNO;...;FOGLIO ;PARTICELLA;SUBALTERNO;...;OCCUPAZIONE SUOLO;...
   *
   * Groups by: OCCUPAZIONE SUOLO (crop) + VARIETA + DATE
   */
  async extractEmiliaRomagnaFormat(rows: ParsedRow[]): Promise<ProductionUnitRaw[]> {
    return productionUnitCsvAgentExtractEmiliaRomagnaFormat.call(this as unknown as ProductionUnitCsvAgentContext, rows);
  }

  /**
   * Extract production units from Veneto Standard format (deterministic, no LLM needed for mapping)
   * Uses the same SIAN/AGEA column structure as Piemonte but with Veneto-specific parsing.
   * Format: Unita produttiva;Comune Descrizione;Sezione;Foglio;Particella;...
   *
   * Groups by: Occupazione Suolo Uso Suolo Primario (crop) + Varieta + DATE (semina)
   */
  async extractVenetoStandardFormat(rows: ParsedRow[]): Promise<ProductionUnitRaw[]> {
    return productionUnitCsvAgentExtractVenetoStandardFormat.call(this as unknown as ProductionUnitCsvAgentContext, rows);
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
  async extractVenetoAVEPAFormat(
    rows: ParsedRow[],
    headers: string[],
  ): Promise<ProductionUnitRaw[]> {
    return productionUnitCsvAgentExtractVenetoAVEPAFormat.call(this as unknown as ProductionUnitCsvAgentContext, rows, headers);
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
  async extractCiaSchedarioViticoloFormat(rows: ParsedRow[]): Promise<ProductionUnitRaw[]> {
    return productionUnitCsvAgentExtractCiaSchedarioViticoloFormat.call(this as unknown as ProductionUnitCsvAgentContext, rows);
  }

  /**
   * Full LLM extraction fallback for production units.
   * Used when deterministic parsing (both regional templates and LLM column mapping)
   * produces 0 results. Sends headers + first 50 rows directly to LLM.
   */
  async extractProductionUnitsWithLLM(csvContent: string): Promise<ProductionUnitRaw[]> {
    return productionUnitCsvAgentExtractProductionUnitsWithLLM.call(this as unknown as ProductionUnitCsvAgentContext, csvContent);
  }

  /**
   * Resolve missing cycle dates using LLM based on crop name and cycle type (Primaria/Secondaria).
   * Returns a map from "cropName|cycleType" to { startDate, endDate }.
   * Falls back to generic defaults (jan-jun / jul-dec) on LLM failure.
   */
  async resolveCycleDatesWithLLM(
    inputs: Array<{ cropName: string; cycleType: 'primary' | 'secondary' | null; year: string }>,
  ): Promise<Map<string, { startDate: string; endDate: string }>> {
    return productionUnitCsvAgentResolveCycleDatesWithLLM.call(this as unknown as ProductionUnitCsvAgentContext, inputs);
  }

  /**
   * Get LLM model instance
   */
  getModel(): ChatOpenAI {
    return productionUnitCsvAgentGetModel.call(this as unknown as ProductionUnitCsvAgentContext);
  }

  resolvePiemonteCropName(
    occupazionePrimario: string | null,
    usoPrimario: string | null,
  ): string | null {
    return productionUnitCsvAgentResolvePiemonteCropName.call(this as unknown as ProductionUnitCsvAgentContext, occupazionePrimario, usoPrimario);
  }

  isGenericOccupazione(value: string): boolean {
    return productionUnitCsvAgentIsGenericOccupazione.call(this as unknown as ProductionUnitCsvAgentContext, value);
  }
}
