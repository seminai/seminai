import { VisuraCameralePdfAgent } from '../../services/agents/company/visura_camerale_pdf_agent';
import type { CompanyControllerContext } from './company-controller.context';

export function companyControllerGetVisuraCameraleAgent(this: CompanyControllerContext): VisuraCameralePdfAgent {
    if (!this.visuraCameraleAgent) {
      this.visuraCameraleAgent = new VisuraCameralePdfAgent();
    }
    return this.visuraCameraleAgent;
  }
