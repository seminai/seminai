import type { ChatOpenAI } from '@langchain/openai';
import { type ParsedRow } from '../file_agent/utils/csv_parser';
import { type CropCatalogEntry } from '../../extraction/production-unit-normalizer';
import { CropIdentification, CropIdentificationInput, ColumnMapping, ProductionUnitRaw, ProductionUnitExtractionResult } from './production_unit_csv_agent.support';

export interface ProductionUnitCsvAgentContext {
  model: ChatOpenAI | null;
  cropCache: Map<string, CropIdentification>;
  cropCatalogCache: CropCatalogEntry[] | null;
  applyCropCacheToUnits(aggregated: Map<string, ProductionUnitRaw>): void;
  collectUnresolvedCropInputs(aggregated: Map<string, ProductionUnitRaw>): CropIdentificationInput[];
  finalizeCropIdentification(aggregated: Map<string, ProductionUnitRaw>): Promise<void>;
  extractProductionUnitsFromCsv(fileBuffer: Buffer): Promise<ProductionUnitExtractionResult>;
  collectUniqueCropInputs(rows: ParsedRow[], mapping: ColumnMapping): CropIdentificationInput[];
  buildCropCacheKey(cropName: string, variety: string | null): string;
  bufferToCsv(buffer: Buffer): string;
  parseCsv(content: string): { headers: string[]; rows: ParsedRow[] };
  getColumnMapping(headers: string[], sampleRows: ParsedRow[]): Promise<ColumnMapping>;
  extractAgeaFormat(rows: ParsedRow[], mapping: ColumnMapping): ProductionUnitRaw[];
  extractLegacyFormat(rows: ParsedRow[], mapping: ColumnMapping): ProductionUnitRaw[];
  parseOccupazione(value: string): { code: string | null; name: string | null };
  cleanBracketValue(value: string | null): string | null;
  getValue(row: ParsedRow, colName: string | null): string | null;
  parseNumber(value: string | null): number | null;
  parseDate(value: string | null): string | null;
  normalizeString(value: string): string;
  identifyCropsWithLLM(cropInputs: CropIdentificationInput[]): Promise<void>;
  getCropIdentification(cropName: string, variety: string | null): {
    cropName: string | null;
    cropType: string | null;
    code: string | null;
    variety: string | null;
  };
  extractLombardiaFormat(rows: ParsedRow[]): Promise<ProductionUnitRaw[]>;
  extractPiemonteFormat(rows: ParsedRow[]): Promise<ProductionUnitRaw[]>;
  extractEmiliaRomagnaFormat(rows: ParsedRow[]): Promise<ProductionUnitRaw[]>;
  extractVenetoStandardFormat(rows: ParsedRow[]): Promise<ProductionUnitRaw[]>;
  extractVenetoAVEPAFormat(rows: ParsedRow[], headers: string[]): Promise<ProductionUnitRaw[]>;
  extractCiaSchedarioViticoloFormat(rows: ParsedRow[]): Promise<ProductionUnitRaw[]>;
  extractProductionUnitsWithLLM(csvContent: string): Promise<ProductionUnitRaw[]>;
  resolveCycleDatesWithLLM(inputs: Array<{ cropName: string; cycleType: 'primary' | 'secondary' | null; year: string }>): Promise<Map<string, { startDate: string; endDate: string }>>;
  getModel(): ChatOpenAI;
  resolvePiemonteCropName(occupazionePrimario: string | null, usoPrimario: string | null): string | null;
  isGenericOccupazione(value: string): boolean;
}
