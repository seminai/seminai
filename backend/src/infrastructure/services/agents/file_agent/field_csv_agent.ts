import type { ChatOpenAI } from '@langchain/openai';
import { type ParsedRow } from './utils/csv_parser';
import { FieldColumnMapping, ExtractedFieldData, FieldRecord, AggregatedField } from './field_csv_agent.support';
import type { FieldCsvAgentContext } from './field-csv-agent.context';
import { fieldCsvAgentExtractFieldsFromCsv } from './field-csv-agent.01-extract-fields-from-csv';
import { fieldCsvAgentAdjustAreaUnitBySample } from './field-csv-agent.02-adjust-area-unit-by-sample';
import { fieldCsvAgentGetCompactSataMapping } from './field-csv-agent.03-get-compact-sata-mapping';
import { fieldCsvAgentBufferToCsv } from './field-csv-agent.04-buffer-to-csv';
import { fieldCsvAgentParseCsv } from './field-csv-agent.05-parse-csv';
import { fieldCsvAgentGetValue } from './field-csv-agent.06-get-value';
import { fieldCsvAgentParseNumber } from './field-csv-agent.07-parse-number';
import { fieldCsvAgentGetColumnMapping } from './field-csv-agent.08-get-column-mapping';
import { fieldCsvAgentExtractRowsWithMapping } from './field-csv-agent.09-extract-rows-with-mapping';
import { fieldCsvAgentAggregateByParticella } from './field-csv-agent.10-aggregate-by-particella';
import { fieldCsvAgentParseAreaToHa } from './field-csv-agent.11-parse-area-to-ha';
import { fieldCsvAgentConvertToOutputFormat } from './field-csv-agent.12-convert-to-output-format';
import { fieldCsvAgentConvertDate } from './field-csv-agent.13-convert-date';
import { fieldCsvAgentGetMaxValue } from './field-csv-agent.14-get-max-value';
import { fieldCsvAgentExtractFieldsWithLLM } from './field-csv-agent.15-extract-fields-with-llm';
import { fieldCsvAgentExtractFieldsLombardiaFormat } from './field-csv-agent.16-extract-fields-lombardia-format';
import { fieldCsvAgentExtractFieldsEmiliaRomagnaFormat } from './field-csv-agent.17-extract-fields-emilia-romagna-format';
import { fieldCsvAgentExtractFieldsPiemonteFormat } from './field-csv-agent.18-extract-fields-piemonte-format';
import { fieldCsvAgentExtractFieldsVenetoFormat } from './field-csv-agent.19-extract-fields-veneto-format';
import { fieldCsvAgentExtractFieldsVenetoAVEPAFormat } from './field-csv-agent.20-extract-fields-veneto-avepaformat';
import { fieldCsvAgentExtractFieldsCiaSchedarioViticoloFormat } from './field-csv-agent.21-extract-fields-cia-schedario-viticolo-format';
import { fieldCsvAgentGetModel } from './field-csv-agent.22-get-model';

export { type ExtractedFieldData } from './field_csv_agent.support';

/**
 * Agent for extracting Field data from CSV/Excel files.
 * Uses a two-phase approach:
 * 1. LLM phase: Analyze headers and sample rows to determine column mapping
 * 2. Deterministic phase: Parse all rows using the mapping, aggregate by particella
 */
export class FieldCsvAgent {

  model: ChatOpenAI | null = null;

  /**
   * Extract fields from CSV/Excel buffer
   */
  async extractFieldsFromCsv(fileBuffer: Buffer): Promise<ExtractedFieldData> {
    return fieldCsvAgentExtractFieldsFromCsv.call(this as unknown as FieldCsvAgentContext, fileBuffer);
  }

  adjustAreaUnitBySample(
    rows: ParsedRow[],
    mapping: FieldColumnMapping,
  ): FieldColumnMapping {
    return fieldCsvAgentAdjustAreaUnitBySample.call(this as unknown as FieldCsvAgentContext, rows, mapping);
  }

  getCompactSataMapping(headers: string[]): FieldColumnMapping | null {
    return fieldCsvAgentGetCompactSataMapping.call(this as unknown as FieldCsvAgentContext, headers);
  }

  // CSV parsing, file conversion, and value helpers – delegated to csv_parser.ts
  bufferToCsv(buffer: Buffer): string {
    return fieldCsvAgentBufferToCsv.call(this as unknown as FieldCsvAgentContext, buffer);
  }

  parseCsv(content: string): { headers: string[]; rows: ParsedRow[] } {
    return fieldCsvAgentParseCsv.call(this as unknown as FieldCsvAgentContext, content);
  }

  getValue(row: ParsedRow, columnName: string | null): string {
    return fieldCsvAgentGetValue.call(this as unknown as FieldCsvAgentContext, row, columnName);
  }

  parseNumber(value: string): number | null {
    return fieldCsvAgentParseNumber.call(this as unknown as FieldCsvAgentContext, value);
  }

  /**
   * Get column mapping from LLM - only sends headers + sample rows
   */
  async getColumnMapping(
    headers: string[],
    sampleRows: ParsedRow[],
  ): Promise<FieldColumnMapping> {
    return fieldCsvAgentGetColumnMapping.call(this as unknown as FieldCsvAgentContext, headers, sampleRows);
  }

  /**
   * Extract rows using the column mapping
   */
  extractRowsWithMapping(rows: ParsedRow[], mapping: FieldColumnMapping): ParsedRow[] {
    return fieldCsvAgentExtractRowsWithMapping.call(this as unknown as FieldCsvAgentContext, rows, mapping);
  }

  /**
   * Aggregate rows by particella
   */
  aggregateByParticella(rows: ParsedRow[], mapping: FieldColumnMapping): AggregatedField[] {
    return fieldCsvAgentAggregateByParticella.call(this as unknown as FieldCsvAgentContext, rows, mapping);
  }

  /**
   * Parse area value to hectares based on detected unit
   */
  parseAreaToHa(value: string, unit: 'HA' | 'MQ' | 'UNKNOWN'): number | null {
    return fieldCsvAgentParseAreaToHa.call(this as unknown as FieldCsvAgentContext, value, unit);
  }

  /**
   * Convert aggregated fields to output format
   */
  convertToOutputFormat(
    aggregatedFields: AggregatedField[],
    mapping: FieldColumnMapping,
  ): FieldRecord[] {
    return fieldCsvAgentConvertToOutputFormat.call(this as unknown as FieldCsvAgentContext, aggregatedFields, mapping);
  }

  /**
   * Convert date from detected format to YYYY-MM-DD
   */
  convertDate(
    dateStr: string,
    format: 'DD/MM/YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD' | 'UNKNOWN',
  ): string | null {
    return fieldCsvAgentConvertDate.call(this as unknown as FieldCsvAgentContext, dateStr, format);
  }

  /**
   * Get max of two nullable numbers
   */
  getMaxValue(current: number | null, candidate: number | null): number | null {
    return fieldCsvAgentGetMaxValue.call(this as unknown as FieldCsvAgentContext, current, candidate);
  }

  /**
   * Fallback: Extract fields using LLM when deterministic parsing fails
   */
  async extractFieldsWithLLM(csvContent: string): Promise<ExtractedFieldData> {
    return fieldCsvAgentExtractFieldsWithLLM.call(this as unknown as FieldCsvAgentContext, csvContent);
  }

  /**
   * Extract fields using Lombardia format (deterministic, no LLM needed)
   * Format: CUAA;SUPERO;COMUNE;PROV;SEZ CENS;FOGLIO;MAPPALE;SUB;...
   */
  extractFieldsLombardiaFormat(rows: ParsedRow[]): ExtractedFieldData {
    return fieldCsvAgentExtractFieldsLombardiaFormat.call(this as unknown as FieldCsvAgentContext, rows);
  }

  /**
   * Extract fields using Emilia-Romagna format (deterministic, no LLM needed)
   * Format: ID. DOMANDA;ANNO;...;FOGLIO ;PARTICELLA;SUBALTERNO;...;OCCUPAZIONE SUOLO;...;SUPERFICIE(ha);...
   */
  extractFieldsEmiliaRomagnaFormat(rows: ParsedRow[]): ExtractedFieldData {
    return fieldCsvAgentExtractFieldsEmiliaRomagnaFormat.call(this as unknown as FieldCsvAgentContext, rows);
  }

  /**
   * Extract fields using Piemonte format (deterministic, no LLM needed)
   * Format: Unita produttiva;Comune Istat;Comune Descrizione;Sezione;Foglio;Particella;...
   */
  extractFieldsPiemonteFormat(rows: ParsedRow[]): ExtractedFieldData {
    return fieldCsvAgentExtractFieldsPiemonteFormat.call(this as unknown as FieldCsvAgentContext, rows);
  }

  /**
   * Extract fields using Veneto format (deterministic, no LLM needed)
   * Format: Similar to Piemonte but SAU is taken from "Superficie Uso Suolo Primario"
   * Reference file: 'campi_elisa Adami.xlsx'
   */
  extractFieldsVenetoFormat(rows: ParsedRow[]): ExtractedFieldData {
    return fieldCsvAgentExtractFieldsVenetoFormat.call(this as unknown as FieldCsvAgentContext, rows);
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
  extractFieldsVenetoAVEPAFormat(rows: ParsedRow[], headers: string[]): ExtractedFieldData {
    return fieldCsvAgentExtractFieldsVenetoAVEPAFormat.call(this as unknown as FieldCsvAgentContext, rows, headers);
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
  extractFieldsCiaSchedarioViticoloFormat(rows: ParsedRow[]): ExtractedFieldData {
    return fieldCsvAgentExtractFieldsCiaSchedarioViticoloFormat.call(this as unknown as FieldCsvAgentContext, rows);
  }

  /**
   * Get or create the LLM model
   */
  getModel(): ChatOpenAI {
    return fieldCsvAgentGetModel.call(this as unknown as FieldCsvAgentContext);
  }
}
