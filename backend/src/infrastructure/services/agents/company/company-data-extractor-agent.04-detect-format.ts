import { CompanyCsvFormat } from './company_data_extractor_agent.support';
import type { CompanyDataExtractorAgentContext } from './company-data-extractor-agent.context';

export function companyDataExtractorAgentDetectFormat(this: CompanyDataExtractorAgentContext, headers: string[]): CompanyCsvFormat {
    const normalized = headers.map((h) => h.trim().toUpperCase());
    const hasRagioneSociale = normalized.includes('RAGIONE SOCIALE');
    const hasCuaa = normalized.includes('CUAA');
    if (hasRagioneSociale || hasCuaa) {
      return 'AGEA';
    }
    const hasUnitaProduttiva = normalized.includes('UNITA PRODUTTIVA');
    const hasComuneDescrizione = normalized.includes('COMUNE DESCRIZIONE');
    if (hasUnitaProduttiva && hasComuneDescrizione) {
      return 'SATA';
    }
    return 'UNKNOWN';
  }
