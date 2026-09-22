import { CompanyDataExtraction } from './company_data_extractor_agent.support';
import type { CompanyDataExtractorAgentContext } from './company-data-extractor-agent.context';

export async function companyDataExtractorAgentExtractFromCsv(this: CompanyDataExtractorAgentContext, fileBuffer: Buffer): Promise<CompanyDataExtraction> {
    const csvContent = this.bufferToCsv(fileBuffer);

    if (!csvContent.trim()) {
      throw new Error('File CSV vuoto');
    }

    // Step 1: Extract company data from CSV headers/first rows using LLM
    const companiesData = await this.extractCompaniesData(csvContent);
    const primaryCompany = companiesData[0];
    console.log('CompanyDataExtractorAgent: Primary company extracted', primaryCompany.name);

    // Step 2: Extract fields using FieldCsvAgent
    const fieldsResult = await this.fieldAgent.extractFieldsFromCsv(fileBuffer);
    console.log(`CompanyDataExtractorAgent: Extracted ${fieldsResult.fields.length} fields`);

    // Step 3: Extract production units using ProductionUnitCsvAgent
    const puExtractionResult =
      await this.productionUnitAgent.extractProductionUnitsFromCsv(fileBuffer);
    const productionUnits = puExtractionResult.units;
    console.log(`CompanyDataExtractorAgent: Extracted ${productionUnits.length} production units`);

    const normalizedCompanies = companiesData.map((c) => ({
      name: c.name,
      vatNumber: c.vatNumber,
      fiscalCode: c.fiscalCode || c.cuaa,
      cuaa: c.cuaa,
      nation: c.nation || 'IT',
      region: c.region,
      city: c.city,
      address: c.address,
      cap: c.cap,
    }));

    return {
      companies: normalizedCompanies,
      company: {
        name: primaryCompany.name,
        vatNumber: primaryCompany.vatNumber,
        fiscalCode: primaryCompany.fiscalCode || primaryCompany.cuaa,
        cuaa: primaryCompany.cuaa,
        nation: primaryCompany.nation || 'IT',
        region: primaryCompany.region,
        city: primaryCompany.city,
        address: primaryCompany.address,
        cap: primaryCompany.cap,
      },
      fields: fieldsResult.fields,
      productionUnits,
    };
  }
