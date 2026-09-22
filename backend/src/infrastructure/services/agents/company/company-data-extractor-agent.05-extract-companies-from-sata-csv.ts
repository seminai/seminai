import { ExtractedCompanyData } from './company_data_extractor_agent.support';
import type { CompanyDataExtractorAgentContext } from './company-data-extractor-agent.context';

export function companyDataExtractorAgentExtractCompaniesFromSataCsv(this: CompanyDataExtractorAgentContext, params: {
    lines: string[];
    headers: string[];
    separator: string;
  }): ExtractedCompanyData[] {
    const headerIndex = new Map<string, number>();
    params.headers.forEach((h, idx) => headerIndex.set(h, idx));

    const getValueByHeader = (values: string[], headerName: string): string => {
      const idx = headerIndex.get(headerName);
      if (idx === undefined) {
        return '';
      }
      return (values[idx] ?? '').trim();
    };

    const extractCityProvince = (
      comuneDescrizione: string,
    ): { city: string | null; province: string | null } => {
      if (!comuneDescrizione) {
        return { city: null, province: null };
      }
      const match = comuneDescrizione.match(/^(.*)\(([^)]+)\)\s*$/);
      if (match) {
        return { city: match[1].trim(), province: match[2].trim() };
      }
      return { city: comuneDescrizione.trim(), province: null };
    };

    const extractAddressFromUnitaProduttiva = (unit: string): string | null => {
      if (!unit) return null;
      const parts = unit
        .split(' - ')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      if (parts.length >= 3) {
        return parts.slice(2).join(' - ');
      }
      return null;
    };

    const extractCuaaFromIdAppezzamento = (value: string): string | null => {
      if (!value) return null;
      const match = value.match(/IT10\/([^/]+)\//i);
      return match ? match[1].trim() : null;
    };

    const companiesByKey = new Map<string, ExtractedCompanyData>();
    const maxLinesToScan = Math.min(params.lines.length, 2000);

    for (let i = 1; i < maxLinesToScan; i++) {
      const values = this.parseCsvLine(params.lines[i], params.separator);
      if (values.length === 0) continue;

      const comuneDescrizione = getValueByHeader(values, 'Comune Descrizione');
      const unitaProduttiva = getValueByHeader(values, 'Unita produttiva');
      const conduttore = getValueByHeader(values, 'Conduttore');
      const aziendaAsservimento = getValueByHeader(values, 'Az cond asservimento');
      const idAppezzamentoAgea = getValueByHeader(values, 'Id appezzamento AGEA');

      const { city, province } = extractCityProvince(comuneDescrizione);
      const address = extractAddressFromUnitaProduttiva(unitaProduttiva);
      const cuaa = extractCuaaFromIdAppezzamento(idAppezzamentoAgea);
      const nameCandidate = aziendaAsservimento || conduttore || '';

      const key = (cuaa || nameCandidate || city || 'UNKNOWN').toUpperCase();
      const existing = companiesByKey.get(key);

      if (!existing) {
        const region = province ? this.getRegionFromProvince(province) : null;
        const name = nameCandidate || (city ? `Azienda Agricola ${city}` : 'Azienda Agricola');
        const vatNumber = cuaa && /^\d{11}$/.test(cuaa) ? cuaa : null;
        const fiscalCode = cuaa && !/^\d{11}$/.test(cuaa) ? cuaa : null;
        companiesByKey.set(key, {
          name,
          vatNumber,
          fiscalCode,
          cuaa,
          nation: 'IT',
          region,
          province,
          city,
          address,
          cap: null,
        });
      } else {
        // Fill missing values if we find better info later in the file
        if (!existing.city && city) existing.city = city;
        if (!existing.province && province) existing.province = province;
        if (!existing.address && address) existing.address = address;
        if (!existing.cuaa && cuaa) existing.cuaa = cuaa;
        if (!existing.region && province) existing.region = this.getRegionFromProvince(province);
        if (
          existing.name.startsWith('Azienda Agricola') &&
          nameCandidate &&
          nameCandidate.length > 0
        ) {
          existing.name = nameCandidate;
        }
      }
    }

    const companies = Array.from(companiesByKey.values());
    return companies.length > 0
      ? companies
      : [
          {
            name: 'Azienda Agricola',
            vatNumber: null,
            fiscalCode: null,
            cuaa: null,
            nation: 'IT',
            region: null,
            province: null,
            city: null,
            address: null,
            cap: null,
          },
        ];
  }
