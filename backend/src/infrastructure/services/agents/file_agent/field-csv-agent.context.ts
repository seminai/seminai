import type { ChatOpenAI } from '@langchain/openai';
import { type ParsedRow } from './utils/csv_parser';
import { FieldColumnMapping, ExtractedFieldData, FieldRecord, AggregatedField } from './field_csv_agent.support';

export interface FieldCsvAgentContext {
  model: ChatOpenAI | null;
  extractFieldsFromCsv(fileBuffer: Buffer): Promise<ExtractedFieldData>;
  adjustAreaUnitBySample(rows: ParsedRow[], mapping: FieldColumnMapping): FieldColumnMapping;
  getCompactSataMapping(headers: string[]): FieldColumnMapping | null;
  bufferToCsv(buffer: Buffer): string;
  parseCsv(content: string): { headers: string[]; rows: ParsedRow[] };
  getValue(row: ParsedRow, columnName: string | null): string;
  parseNumber(value: string): number | null;
  getColumnMapping(headers: string[], sampleRows: ParsedRow[]): Promise<FieldColumnMapping>;
  extractRowsWithMapping(rows: ParsedRow[], mapping: FieldColumnMapping): ParsedRow[];
  aggregateByParticella(rows: ParsedRow[], mapping: FieldColumnMapping): AggregatedField[];
  parseAreaToHa(value: string, unit: 'HA' | 'MQ' | 'UNKNOWN'): number | null;
  convertToOutputFormat(aggregatedFields: AggregatedField[], mapping: FieldColumnMapping): FieldRecord[];
  convertDate(dateStr: string, format: 'DD/MM/YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD' | 'UNKNOWN'): string | null;
  getMaxValue(current: number | null, candidate: number | null): number | null;
  extractFieldsWithLLM(csvContent: string): Promise<ExtractedFieldData>;
  extractFieldsLombardiaFormat(rows: ParsedRow[]): ExtractedFieldData;
  extractFieldsEmiliaRomagnaFormat(rows: ParsedRow[]): ExtractedFieldData;
  extractFieldsPiemonteFormat(rows: ParsedRow[]): ExtractedFieldData;
  extractFieldsVenetoFormat(rows: ParsedRow[]): ExtractedFieldData;
  extractFieldsVenetoAVEPAFormat(rows: ParsedRow[], headers: string[]): ExtractedFieldData;
  extractFieldsCiaSchedarioViticoloFormat(rows: ParsedRow[]): ExtractedFieldData;
  getModel(): ChatOpenAI;
}
