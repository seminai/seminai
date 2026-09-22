import { z } from 'zod';
import type { ChatOpenAI } from '@langchain/openai';
import * as XLSX from 'xlsx';
import { FieldCsvAgent, ExtractedFieldData } from '../file_agent/field_csv_agent';
import {
  ProductionUnitCsvAgent,
  ProductionUnitRaw,
} from '../production_unit/production_unit_csv_agent';
import { LlmJobType } from '@prisma/client';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { createChatModel } from '../../llm-model-factory';

const usageLogger = LlmUsageLogger.getInstance();

/**
 * Schema for company data extracted from CSV by LLM
 */
const CompanyExtractionSchema = z.object({
  name: z.string().describe('Nome ufficiale azienda/ragione sociale'),
  vatNumber: z.string().nullable().describe('Partita IVA (11 cifre)'),
  fiscalCode: z.string().nullable().describe('Codice fiscale (16 caratteri) o CUAA'),
  cuaa: z.string().nullable().describe('CUAA (può essere CF o P.IVA)'),
  nation: z.string().describe('Nazione (default IT)'),
  region: z.string().nullable().describe('Regione italiana'),
  province: z.string().nullable().describe('Provincia (sigla 2 lettere)'),
  city: z.string().nullable().describe('Comune principale'),
  address: z.string().nullable().describe('Indirizzo sede'),
  cap: z.string().nullable().describe('CAP (5 cifre)'),
});

type ExtractedCompanyData = z.infer<typeof CompanyExtractionSchema>;

/**
 * Schema for extracting multiple companies from a CSV/Excel sample.
 * The LLM should list distinct companies by official name / CUAA when multiple exist.
 */
const CompaniesExtractionSchema = z.object({
  companies: z
    .array(CompanyExtractionSchema)
    .min(1)
    .describe('Distinct companies found in the file, ordered by first appearance'),
});

type ExtractedCompaniesData = z.infer<typeof CompaniesExtractionSchema>;

type CompanyCsvFormat = 'AGEA' | 'SATA' | 'UNKNOWN';

/**
 * Italian region mapping from province codes
 */
const PROVINCE_TO_REGION: Record<string, string> = {
  // Piemonte
  TO: 'Piemonte',
  VC: 'Piemonte',
  NO: 'Piemonte',
  CN: 'Piemonte',
  AT: 'Piemonte',
  AL: 'Piemonte',
  BI: 'Piemonte',
  VB: 'Piemonte',
  // Lombardia
  VA: 'Lombardia',
  CO: 'Lombardia',
  SO: 'Lombardia',
  MI: 'Lombardia',
  BG: 'Lombardia',
  BS: 'Lombardia',
  PV: 'Lombardia',
  CR: 'Lombardia',
  MN: 'Lombardia',
  LC: 'Lombardia',
  LO: 'Lombardia',
  MB: 'Lombardia',
  // Veneto
  VR: 'Veneto',
  VI: 'Veneto',
  BL: 'Veneto',
  TV: 'Veneto',
  VE: 'Veneto',
  PD: 'Veneto',
  RO: 'Veneto',
  // Emilia-Romagna
  PC: 'Emilia-Romagna',
  PR: 'Emilia-Romagna',
  RE: 'Emilia-Romagna',
  MO: 'Emilia-Romagna',
  BO: 'Emilia-Romagna',
  FE: 'Emilia-Romagna',
  RA: 'Emilia-Romagna',
  FC: 'Emilia-Romagna',
  RN: 'Emilia-Romagna',
  // Toscana
  MS: 'Toscana',
  LU: 'Toscana',
  PT: 'Toscana',
  FI: 'Toscana',
  LI: 'Toscana',
  PI: 'Toscana',
  AR: 'Toscana',
  SI: 'Toscana',
  GR: 'Toscana',
  PO: 'Toscana',
  // Lazio
  VT: 'Lazio',
  RI: 'Lazio',
  RM: 'Lazio',
  LT: 'Lazio',
  FR: 'Lazio',
  // Campania
  CE: 'Campania',
  BN: 'Campania',
  NA: 'Campania',
  AV: 'Campania',
  SA: 'Campania',
  // Puglia
  FG: 'Puglia',
  BT: 'Puglia',
  BA: 'Puglia',
  TA: 'Puglia',
  BR: 'Puglia',
  LE: 'Puglia',
  // Sicilia
  TP: 'Sicilia',
  PA: 'Sicilia',
  ME: 'Sicilia',
  AG: 'Sicilia',
  CL: 'Sicilia',
  EN: 'Sicilia',
  CT: 'Sicilia',
  RG: 'Sicilia',
  SR: 'Sicilia',
  // Sardegna
  SS: 'Sardegna',
  NU: 'Sardegna',
  CA: 'Sardegna',
  OR: 'Sardegna',
  SU: 'Sardegna',
  // Altri
  AO: "Valle d'Aosta",
  TN: 'Trentino-Alto Adige',
  BZ: 'Trentino-Alto Adige',
  UD: 'Friuli-Venezia Giulia',
  GO: 'Friuli-Venezia Giulia',
  TS: 'Friuli-Venezia Giulia',
  PN: 'Friuli-Venezia Giulia',
  GE: 'Liguria',
  SV: 'Liguria',
  IM: 'Liguria',
  SP: 'Liguria',
  PG: 'Umbria',
  TR: 'Umbria',
  AN: 'Marche',
  PU: 'Marche',
  MC: 'Marche',
  FM: 'Marche',
  AP: 'Marche',
  AQ: 'Abruzzo',
  TE: 'Abruzzo',
  PE: 'Abruzzo',
  CH: 'Abruzzo',
  CB: 'Molise',
  IS: 'Molise',
  PZ: 'Basilicata',
  MT: 'Basilicata',
  CS: 'Calabria',
  CZ: 'Calabria',
  RC: 'Calabria',
  KR: 'Calabria',
  VV: 'Calabria',
};

/**
 * Output of the complete extraction
 */
export interface CompanyDataExtraction {
  companies: Array<{
    name: string;
    vatNumber: string | null;
    fiscalCode: string | null;
    cuaa: string | null;
    nation: string | null;
    region: string | null;
    city: string | null;
    address: string | null;
    cap: string | null;
  }>;
  company: {
    name: string;
    vatNumber: string | null;
    fiscalCode: string | null;
    cuaa: string | null;
    nation: string | null;
    region: string | null;
    city: string | null;
    address: string | null;
    cap: string | null;
  };
  fields: ExtractedFieldData['fields'];
  productionUnits: ProductionUnitRaw[];
}

/**
 * Agent that extracts company, fields, and production units from a CSV/Excel file.
 * Uses LLM for company identification and delegates to existing agents for fields and production units.
 */
export class CompanyDataExtractorAgent {
  private model: ChatOpenAI | null = null;
  private fieldAgent: FieldCsvAgent;
  private productionUnitAgent: ProductionUnitCsvAgent;

  constructor() {
    this.fieldAgent = new FieldCsvAgent();
    this.productionUnitAgent = new ProductionUnitCsvAgent();
  }

  /**
   * Extract all data from CSV/Excel buffer
   */
  async extractFromCsv(fileBuffer: Buffer): Promise<CompanyDataExtraction> {
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

  /**
   * Convert buffer to CSV string, handling Excel files
   */
  private bufferToCsv(buffer: Buffer): string {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (firstSheet) {
        return XLSX.utils.sheet_to_csv(firstSheet, { FS: ';' });
      }
    } catch {
      // Not an Excel file, treat as CSV
    }

    let content = buffer.toString('utf-8');
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return content;
  }

  /**
   * Extract companies data using LLM analysis of CSV content
   */
  private async extractCompaniesData(csvContent: string): Promise<ExtractedCompanyData[]> {
    const lines = csvContent.split('\n').filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      throw new Error('CSV troppo corto per estrarre dati azienda');
    }

    const headerLine = lines[0];
    const separator = this.detectSeparator(headerLine);
    const headers = this.parseCsvLine(headerLine, separator);
    const format = this.detectFormat(headers);

    if (format === 'SATA') {
      const companies = this.extractCompaniesFromSataCsv({ lines, headers, separator });
      return companies.map((c) => this.normalizeCompany(c));
    }

    // Sample up to 60 rows spread across the file to support multi-company files.
    const dataLines = lines.slice(1);
    const targetSamples = 60;
    const sampleLines: string[] = [headerLine];
    if (dataLines.length <= targetSamples) {
      sampleLines.push(...dataLines);
    } else {
      const step = Math.max(1, Math.floor(dataLines.length / targetSamples));
      for (let i = 0; i < dataLines.length && sampleLines.length < targetSamples + 1; i += step) {
        sampleLines.push(dataLines[i]);
      }
    }
    const sampleContent = sampleLines.join('\n');

    console.log('CompanyDataExtractorAgent: Extracting companies with LLM');

    const usageAccumulator = new UsageAccumulator();
    const usageCollector = new LangChainUsageCollector(usageAccumulator);
    const extractor = this.getModel().withStructuredOutput(CompaniesExtractionSchema);
    const result = await extractor.invoke(
      [
        {
          role: 'system',
          content: `Sei un esperto di dati agricoli italiani. Analizza il CSV e estrai i dati delle aziende agricole.

OBIETTIVO: Estrarre TUTTE le aziende presenti nel file. Se il file contiene dati di UNA sola azienda (anche con più righe/colture), restituisci UN SOLO elemento nell'array.

⚠️ CRITICO - DISTINGUI COLONNE AZIENDA DA COLONNE COLTURALI:

**COLONNE DATI AZIENDA** (usale per il nome azienda):
- "RAGIONE SOCIALE", "Ragione Sociale" → Nome ufficiale azienda
- "Az cond asservimento", "Azienda" → Nome azienda
- "Conduttore" → Nome conduttore/proprietario
- "Unita produttiva" → Può contenere nome azienda se formato "NOME - COMUNE - INDIRIZZO"

**COLONNE DATI COLTURALI** (NON usare MAI per il nome azienda):
- "Occupazione Suolo", "Occupazione Suolo Uso Suolo Primario" → Nome COLTURA (es. "ERBA MEDICA", "SOIA", "VITE")
- "Coltura", "Crop", "Prodotto" → Nome COLTURA
- "Varietà", "Varieta" → Varietà colturale
- "Destinazione", "Uso" → Tipo di uso colturale

⚠️ REGOLA FONDAMENTALE: Se una colonna contiene nomi di COLTURE (es. "ERBA MEDICA", "SOIA", "GRANTURCO", "VITE", "FRUMENTO"), quella colonna NON è il nome dell'azienda. È un dato colturale che varia per ogni riga.

FORMATI CSV COMUNI:

1. **Formato AGEA/Emilia-Romagna**:
   - Colonna "RAGIONE SOCIALE": nome ufficiale azienda (esempio generico: "NOME AZIENDA SOCIETA' AGRICOLA") - NON copiare l'esempio
   - Colonna "CUAA": codice fiscale/P.IVA (esempio generico: "01234567890") - NON copiare l'esempio
   - Colonna "REGIONE": regione (es. "EMILIA ROMAGNA")
   - Colonna "PROVINCIA": sigla provincia (es. "RA")
   - Colonna "COMUNE": comune (es. "ALFONSINE")

2. **Formato SATA/SIAN**:
   - Colonna "Unita produttiva": contiene "CODICE - COMUNE - INDIRIZZO" o "NOME AZIENDA - COMUNE - INDIRIZZO"
   - Colonna "Comune Descrizione": "COMUNE (PROV)" (es. "POZZOLO FORMIGARO (AL)")
   - Colonna "Conduttore": nome del conduttore/proprietario
   - Colonna "Az cond asservimento": nome azienda se diverso da conduttore
   - Colonna "Id appezzamento AGEA": contiene codice fiscale nel formato "IT10/CODICEFISCALE/..."

REGOLE DI ESTRAZIONE - PRIORITÀ ASSOLUTA:

**name** (CAMPO CRITICO - OBBLIGATORIO):
Analizza l'intestazione CSV e identifica le colonne disponibili. Poi applica questa PRIORITÀ STRINGENTE:

1. Se esiste una colonna nell'intestazione che contiene "RAGIONE SOCIALE" (o varianti):
   → Il campo "name" DEVE essere preso ESCLUSIVAMENTE dal valore di quella colonna nella prima riga dati valida
   → NON usare MAI il comune/city come name se questa colonna esiste
   → NON usare MAI "Azienda Agricola" generico

2. Se NON esiste "RAGIONE SOCIALE" ma esiste "Az cond asservimento":
   → Usa il valore di "Az cond asservimento" dalla prima riga valida (se non vuoto)

3. Se NON esiste né "RAGIONE SOCIALE" né "Az cond asservimento" ma esiste "Conduttore":
   → Usa il valore di "Conduttore" dalla prima riga valida (se non vuoto)

4. Se NON esiste "RAGIONE SOCIALE" né "Az cond asservimento" né "Conduttore":
   → Se "Unita produttiva" contiene formato "NOME - COMUNE - INDIRIZZO", estrai il NOME (prima parte)
   → Altrimenti usa "Azienda Agricola [comune]" dove comune è il comune principale del file

⚠️ NON USARE MAI:
- Valori da colonne "Occupazione Suolo", "Coltura", "Crop" → sono COLTURE, non aziende
- Se vedi valori come "ERBA MEDICA", "SOIA", "VITE", "GRANTURCO" → sono COLTURE, non nomi azienda
- Se tutte le righe hanno lo stesso comune ma colture diverse → c'è UNA sola azienda, non una per coltura

IMPORTANTE: Il campo "name" rappresenta il NOME UFFICIALE DELL'AZIENDA/SOCIETÀ, non la coltura né la località. Se non trovi colonne azienda esplicite, deduci che c'è UNA sola azienda per tutto il file.

**cuaa/fiscalCode**:
- Cerca in colonna "CUAA"
- Oppure estrai da "Id appezzamento AGEA" la parte dopo "IT10/" e prima del secondo "/" (es. da "IT10/CPRRRT60T02F965V/AAB93" estrai "CPRRRT60T02F965V")

**vatNumber**:
- Se CUAA è di 11 cifre, è una P.IVA
- Altrimenti è un codice fiscale

**region**:
- Cerca in colonna "REGIONE"
- Oppure deduci dalla provincia:
  - AL, TO, CN, AT, VC, NO, BI, VB → Piemonte
  - RA, BO, FE, MO, RE, PR, PC, FC, RN → Emilia-Romagna
  - MI, BG, BS, CO, CR, LC, LO, MN, MB, PV, SO, VA → Lombardia
  - VR, VI, TV, PD, VE, BL, RO → Veneto

**province**:
- Cerca in colonna "PROVINCIA"
- Oppure estrai da "Comune Descrizione" la sigla tra parentesi (es. da "POZZOLO FORMIGARO (AL)" estrai "AL")

**city**:
- Cerca in colonna "COMUNE"
- Oppure da "Comune Descrizione" senza la provincia
- Oppure dalla seconda parte di "Unita produttiva" (dopo il primo " - ")

**address**:
- Dalla terza parte di "Unita produttiva" (dopo il secondo " - ")

IMPORTANTE:
- Analizza TUTTE le righe fornite per trovare i dati
- Non restituire valori vuoti o generici se i dati sono presenti
- Non inventare dati: se non trovi un campo, metti null (JSON null, non la stringa "null")
- Il campo "name" deve contenere il nome REALE dell'azienda
- Se non trovi colonne azienda esplicite (RAGIONE SOCIALE, Az cond asservimento, Conduttore), deduci che c'è UNA sola azienda per tutto il file
- NON creare un'azienda per ogni riga o per ogni coltura diversa: le colture (ERBA MEDICA, SOIA, VITE, ecc.) sono DATI COLTURALI, non aziende separate`,
        },
        {
          role: 'user',
          content: `Estrai le aziende (companies[]) da questo CSV:\n\n${sampleContent}`,
        },
      ],
      { callbacks: [usageCollector] },
    );

    // Log usage asynchronously
    usageLogger
      .logFromAccumulator(usageAccumulator, {
        jobType: LlmJobType.CSV_IMPORT,
        model: 'gpt-4o-mini',
        metadata: { step: 'company-data-extraction', rowsSampled: sampleLines.length },
      })
      .catch((err) => console.warn('[COMPANY-EXTRACTOR] Failed to log usage:', err));

    const companies = (result as ExtractedCompaniesData).companies;
    const normalized = companies.map((c) => this.normalizeCompany(c));
    const withRegion = normalized.map((c) => ({
      ...c,
      region: c.region ?? (c.province ? this.getRegionFromProvince(c.province) : null),
    }));
    return withRegion;
  }

  private detectFormat(headers: string[]): CompanyCsvFormat {
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

  private extractCompaniesFromSataCsv(params: {
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

  private detectSeparator(line: string): string {
    const separators = [';', ',', '\t', '|'];
    const counts = separators.map((sep) => ({
      sep,
      count: (line.match(new RegExp(sep.replace(/[|]/g, '\\$&'), 'g')) || []).length,
    }));
    counts.sort((a, b) => b.count - a.count);
    return counts[0]?.sep ?? ';';
  }

  private parseCsvLine(line: string, separator: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    while (i < line.length) {
      const char = line[i];
      const nextChar = line[i + 1];
      if (char === '"') {
        if (!inQuotes) {
          inQuotes = true;
        } else if (nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else if (char === separator && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
      i++;
    }
    result.push(current.trim());
    return result;
  }

  private normalizeCompany(company: ExtractedCompanyData): ExtractedCompanyData {
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

  /**
   * Get region from province code
   */
  private getRegionFromProvince(province: string | null): string | null {
    if (!province) return null;
    return PROVINCE_TO_REGION[province.toUpperCase()] || null;
  }

  /**
   * Get or create the LLM model
   */
  private getModel(): ChatOpenAI {
    if (!this.model) {
      const { model } = createChatModel({
        modelName: 'gpt-4o-mini',
        temperature: 0,
      });
      this.model = model;
    }
    return this.model;
  }
}
