import { z } from 'zod';
import { ExtractedFieldData } from '../file_agent/field_csv_agent';
import { ProductionUnitRaw } from '../production_unit/production_unit_csv_agent';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';


export const usageLogger = LlmUsageLogger.getInstance();


/**
 * Schema for company data extracted from CSV by LLM
 */
export const CompanyExtractionSchema = z.object({
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


export type ExtractedCompanyData = z.infer<typeof CompanyExtractionSchema>;


/**
 * Schema for extracting multiple companies from a CSV/Excel sample.
 * The LLM should list distinct companies by official name / CUAA when multiple exist.
 */
export const CompaniesExtractionSchema = z.object({
  companies: z
    .array(CompanyExtractionSchema)
    .min(1)
    .describe('Distinct companies found in the file, ordered by first appearance'),
});


export type ExtractedCompaniesData = z.infer<typeof CompaniesExtractionSchema>;


export type CompanyCsvFormat = 'AGEA' | 'SATA' | 'UNKNOWN';


/**
 * Italian region mapping from province codes
 */
export const PROVINCE_TO_REGION: Record<string, string> = {
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
