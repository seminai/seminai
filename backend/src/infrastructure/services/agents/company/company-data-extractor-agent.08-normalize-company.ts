import { ExtractedCompanyData } from './company_data_extractor_agent.support';
import type { CompanyDataExtractorAgentContext } from './company-data-extractor-agent.context';

export function companyDataExtractorAgentNormalizeCompany(this: CompanyDataExtractorAgentContext, company: ExtractedCompanyData): ExtractedCompanyData {
    const normalizeNullableString = (value: string | null | undefined): string | null => {
      if (typeof value !== 'string') {
        return null;
      }
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return null;
      }
      if (trimmed.toLowerCase() === 'null') {
        return null;
      }
      return trimmed;
    };

    const name = normalizeNullableString(company.name) ?? 'Azienda Agricola';
    return {
      name,
      vatNumber: normalizeNullableString(company.vatNumber),
      fiscalCode: normalizeNullableString(company.fiscalCode),
      cuaa: normalizeNullableString(company.cuaa),
      nation: normalizeNullableString(company.nation) ?? 'IT',
      region: normalizeNullableString(company.region),
      province: normalizeNullableString(company.province),
      city: normalizeNullableString(company.city),
      address: normalizeNullableString(company.address),
      cap: normalizeNullableString(company.cap),
    };
  }
