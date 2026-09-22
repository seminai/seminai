import { CompanyDataExtractorAgent } from '../../services/agents/company/company_data_extractor_agent';
import type { CompanyControllerContext } from './company-controller.context';

export function companyControllerGetCompanyDataExtractorAgent(this: CompanyControllerContext): CompanyDataExtractorAgent {
    if (!this.companyDataExtractorAgent) {
      this.companyDataExtractorAgent = new CompanyDataExtractorAgent();
    }
    return this.companyDataExtractorAgent;
  }
