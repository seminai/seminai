import type { ChatOpenAI } from '@langchain/openai';
import { FieldCsvAgent } from '../file_agent/field_csv_agent';
import { ProductionUnitCsvAgent } from '../production_unit/production_unit_csv_agent';
import { ExtractedCompanyData, CompanyCsvFormat, CompanyDataExtraction } from './company_data_extractor_agent.support';
import type { CompanyDataExtractorAgentContext } from './company-data-extractor-agent.context';
import { companyDataExtractorAgentExtractFromCsv } from './company-data-extractor-agent.01-extract-from-csv';
import { companyDataExtractorAgentBufferToCsv } from './company-data-extractor-agent.02-buffer-to-csv';
import { companyDataExtractorAgentExtractCompaniesData } from './company-data-extractor-agent.03-extract-companies-data';
import { companyDataExtractorAgentDetectFormat } from './company-data-extractor-agent.04-detect-format';
import { companyDataExtractorAgentExtractCompaniesFromSataCsv } from './company-data-extractor-agent.05-extract-companies-from-sata-csv';
import { companyDataExtractorAgentDetectSeparator } from './company-data-extractor-agent.06-detect-separator';
import { companyDataExtractorAgentParseCsvLine } from './company-data-extractor-agent.07-parse-csv-line';
import { companyDataExtractorAgentNormalizeCompany } from './company-data-extractor-agent.08-normalize-company';
import { companyDataExtractorAgentGetRegionFromProvince } from './company-data-extractor-agent.09-get-region-from-province';
import { companyDataExtractorAgentGetModel } from './company-data-extractor-agent.10-get-model';

export { type CompanyDataExtraction } from './company_data_extractor_agent.support';

/**
 * Agent that extracts company, fields, and production units from a CSV/Excel file.
 * Uses LLM for company identification and delegates to existing agents for fields and production units.
 */
export class CompanyDataExtractorAgent {

  model: ChatOpenAI | null = null;
  fieldAgent: FieldCsvAgent;
  productionUnitAgent: ProductionUnitCsvAgent;

  constructor() {
    this.fieldAgent = new FieldCsvAgent();
    this.productionUnitAgent = new ProductionUnitCsvAgent();
  }

  /**
   * Extract all data from CSV/Excel buffer
   */
  async extractFromCsv(fileBuffer: Buffer): Promise<CompanyDataExtraction> {
    return companyDataExtractorAgentExtractFromCsv.call(this as unknown as CompanyDataExtractorAgentContext, fileBuffer);
  }

  /**
   * Convert buffer to CSV string, handling Excel files
   */
  bufferToCsv(buffer: Buffer): string {
    return companyDataExtractorAgentBufferToCsv.call(this as unknown as CompanyDataExtractorAgentContext, buffer);
  }

  /**
   * Extract companies data using LLM analysis of CSV content
   */
  async extractCompaniesData(csvContent: string): Promise<ExtractedCompanyData[]> {
    return companyDataExtractorAgentExtractCompaniesData.call(this as unknown as CompanyDataExtractorAgentContext, csvContent);
  }

  detectFormat(headers: string[]): CompanyCsvFormat {
    return companyDataExtractorAgentDetectFormat.call(this as unknown as CompanyDataExtractorAgentContext, headers);
  }

  extractCompaniesFromSataCsv(params: {
    lines: string[];
    headers: string[];
    separator: string;
  }): ExtractedCompanyData[] {
    return companyDataExtractorAgentExtractCompaniesFromSataCsv.call(this as unknown as CompanyDataExtractorAgentContext, params);
  }

  detectSeparator(line: string): string {
    return companyDataExtractorAgentDetectSeparator.call(this as unknown as CompanyDataExtractorAgentContext, line);
  }

  parseCsvLine(line: string, separator: string): string[] {
    return companyDataExtractorAgentParseCsvLine.call(this as unknown as CompanyDataExtractorAgentContext, line, separator);
  }

  normalizeCompany(company: ExtractedCompanyData): ExtractedCompanyData {
    return companyDataExtractorAgentNormalizeCompany.call(this as unknown as CompanyDataExtractorAgentContext, company);
  }

  /**
   * Get region from province code
   */
  getRegionFromProvince(province: string | null): string | null {
    return companyDataExtractorAgentGetRegionFromProvince.call(this as unknown as CompanyDataExtractorAgentContext, province);
  }

  /**
   * Get or create the LLM model
   */
  getModel(): ChatOpenAI {
    return companyDataExtractorAgentGetModel.call(this as unknown as CompanyDataExtractorAgentContext);
  }
}
