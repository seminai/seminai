import type { ChatOpenAI } from '@langchain/openai';
import { FieldCsvAgent } from '../file_agent/field_csv_agent';
import { ProductionUnitCsvAgent } from '../production_unit/production_unit_csv_agent';
import { ExtractedCompanyData, CompanyCsvFormat, CompanyDataExtraction } from './company_data_extractor_agent.support';

export interface CompanyDataExtractorAgentContext {
  model: ChatOpenAI | null;
  fieldAgent: FieldCsvAgent;
  productionUnitAgent: ProductionUnitCsvAgent;
  extractFromCsv(fileBuffer: Buffer): Promise<CompanyDataExtraction>;
  bufferToCsv(buffer: Buffer): string;
  extractCompaniesData(csvContent: string): Promise<ExtractedCompanyData[]>;
  detectFormat(headers: string[]): CompanyCsvFormat;
  extractCompaniesFromSataCsv(params: {
    lines: string[];
    headers: string[];
    separator: string;
  }): ExtractedCompanyData[];
  detectSeparator(line: string): string;
  parseCsvLine(line: string, separator: string): string[];
  normalizeCompany(company: ExtractedCompanyData): ExtractedCompanyData;
  getRegionFromProvince(province: string | null): string | null;
  getModel(): ChatOpenAI;
}
