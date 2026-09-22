import { PROVINCE_TO_REGION } from './company_data_extractor_agent.support';
import type { CompanyDataExtractorAgentContext } from './company-data-extractor-agent.context';

export function companyDataExtractorAgentGetRegionFromProvince(this: CompanyDataExtractorAgentContext, province: string | null): string | null {
    if (!province) return null;
    return PROVINCE_TO_REGION[province.toUpperCase()] || null;
  }
