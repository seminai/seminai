import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { Field, ProductionUnit } from '@prisma/client';
import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { JobHistoryManager } from './historyCollector';
import type { DisciplinariContext } from './types';
import nodeGeocoder, { Options as GeocoderOptions } from 'node-geocoder';
import { type DisciplinariEntry } from '../../tool/getDisciplinariFromBDF';

export const usageLogger = LlmUsageLogger.getInstance();

export type NormalizedUnit = Partial<
  ProductionUnit & Partial<Field> & { disciplinari: string[]; cropVariety: string }
>;

export interface FlowMatchDosageDisciplinariParams {
  readonly units: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
  readonly normalizedUnits: ReadonlyArray<NormalizedUnit>;
  readonly historyManager?: JobHistoryManager;
  readonly disciplinariContext?: DisciplinariContext;
}

export interface DoseLimit {
  readonly productName: string;
  readonly regNumber: string;
  readonly maxDose?: number;
  readonly minDose?: number;
  readonly unitOfMeasure?: string;
  readonly regionLabel?: string;
}

export interface DoseSearchContext {
  readonly diseases: ReadonlyArray<string>;
  readonly agronomicNotes?: string;
  readonly priorityTargets?: ReadonlyArray<string>;
}

export enum RegionSource {
  FIELD = 'field',
  FIELD_GEOCODED = 'field_geocoded',
  COMPANY_GEOCODED = 'company_geocoded',
  PROVINCE_LOOKUP = 'province_lookup',
  CITY_GEOCODED = 'city_geocoded',
  UNKNOWN = 'unknown',
}

export interface RegionResolution {
  readonly regionLabel?: string;
  readonly normalizedRegion?: string;
  readonly source: RegionSource;
  readonly companyName?: string;
}

export interface RegionLookupInput {
  readonly address?: string;
  readonly city?: string;
  readonly cap?: string;
  readonly province?: string;
  readonly nation?: string;
}

export interface RegionLookupResult extends RegionResolution {
  readonly addressUsed?: string;
}

export const GEOCODER_OPTIONS: GeocoderOptions = {
  provider: 'openstreetmap',
  timeout: 5000,
};

export const geocoder = nodeGeocoder(GEOCODER_OPTIONS);

export const geocodeCache = new Map<string, string | null>();

export const unitRegionCache = new Map<string, RegionResolution>();

export const disciplinariCache = new Map<string, readonly DisciplinariEntry[]>();

export const PROVINCE_TO_REGION: Record<string, string> = {
  AG: 'Sicilia',
  AL: 'Piemonte',
  AN: 'Marche',
  AO: "Valle d'Aosta",
  AP: 'Marche',
  AQ: 'Abruzzo',
  AR: 'Toscana',
  AT: 'Piemonte',
  AV: 'Campania',
  BA: 'Puglia',
  BG: 'Lombardia',
  BI: 'Piemonte',
  BL: 'Veneto',
  BN: 'Campania',
  BO: 'Emilia-Romagna',
  BR: 'Puglia',
  BS: 'Lombardia',
  BT: 'Puglia',
  BZ: 'Trentino-Alto Adige',
  CA: 'Sardegna',
  CB: 'Molise',
  CE: 'Campania',
  CH: 'Abruzzo',
  CL: 'Sicilia',
  CN: 'Piemonte',
  CO: 'Lombardia',
  CR: 'Lombardia',
  CS: 'Calabria',
  CT: 'Sicilia',
  CZ: 'Calabria',
  EN: 'Sicilia',
  FE: 'Emilia-Romagna',
  FG: 'Puglia',
  FI: 'Toscana',
  FM: 'Marche',
  FR: 'Lazio',
  GE: 'Liguria',
  GO: 'Friuli-Venezia Giulia',
  GR: 'Toscana',
  IM: 'Liguria',
  IS: 'Molise',
  KR: 'Calabria',
  LC: 'Lombardia',
  LE: 'Puglia',
  LI: 'Toscana',
  LO: 'Lombardia',
  LT: 'Lazio',
  LU: 'Toscana',
  MB: 'Lombardia',
  MC: 'Marche',
  ME: 'Sicilia',
  MI: 'Lombardia',
  MN: 'Lombardia',
  MO: 'Emilia-Romagna',
  MS: 'Toscana',
  MT: 'Basilicata',
  NA: 'Campania',
  NO: 'Piemonte',
  NU: 'Sardegna',
  OR: 'Sardegna',
  PA: 'Sicilia',
  PC: 'Emilia-Romagna',
  PD: 'Veneto',
  PE: 'Abruzzo',
  PG: 'Umbria',
  PI: 'Toscana',
  PN: 'Friuli-Venezia Giulia',
  PO: 'Toscana',
  PR: 'Emilia-Romagna',
  PT: 'Toscana',
  PU: 'Marche',
  PV: 'Lombardia',
  PZ: 'Basilicata',
  RA: 'Emilia-Romagna',
  RC: 'Calabria',
  RE: 'Emilia-Romagna',
  RG: 'Sicilia',
  RI: 'Lazio',
  RM: 'Lazio',
  RN: 'Emilia-Romagna',
  RO: 'Veneto',
  SA: 'Campania',
  SI: 'Toscana',
  SO: 'Lombardia',
  SP: 'Liguria',
  SR: 'Sicilia',
  SS: 'Sardegna',
  SU: 'Sardegna',
  SV: 'Liguria',
  TA: 'Puglia',
  TE: 'Abruzzo',
  TN: 'Trentino-Alto Adige',
  TO: 'Piemonte',
  TP: 'Sicilia',
  TR: 'Umbria',
  TS: 'Friuli-Venezia Giulia',
  TV: 'Veneto',
  UD: 'Friuli-Venezia Giulia',
  VA: 'Lombardia',
  VB: 'Piemonte',
  VC: 'Piemonte',
  VE: 'Veneto',
  VI: 'Veneto',
  VR: 'Veneto',
  VS: 'Sardegna',
  VT: 'Lazio',
  VV: 'Calabria',
};

export function normalizeString(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

export function normalizeSearchToken(value?: string): string | undefined {
  const normalized = normalizeString(value);
  if (!normalized) return undefined;
  return normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function normalizeRegionName(value?: string | null): string | undefined {
  const raw = normalizeString(value);
  if (!raw) return undefined;
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/gi, '')
    .toLowerCase();
}

export function normalizeProvinceCode(value?: string | null): string | undefined {
  const raw = normalizeString(value);
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^a-z]/gi, '');
  if (cleaned.length !== 2) return undefined;
  return cleaned.toUpperCase();
}

export function extractProvinceCode(value?: string | null): string | undefined {
  if (!value) return undefined;
  const normalized = normalizeString(value);
  if (!normalized) return undefined;
  const parenthesesMatch = normalized.match(/\(([A-Za-z]{2})\)/);
  if (parenthesesMatch?.[1]) return parenthesesMatch[1].toUpperCase();
  const tokens = normalized.split(/[\s,]+/);
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (/^[A-Za-z]{2}$/.test(tokens[index])) {
      return tokens[index].toUpperCase();
    }
  }
  return undefined;
}

export function buildProductKey(name: string, regNumber: string): string {
  const normalizedName = normalizeRegionName(name) ?? '';
  return `${normalizedName}|${regNumber.trim()}`;
}

export function parseDoseValue(value?: string): number | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\./g, '').replace(/,/g, '.').trim();
  if (!normalized) return undefined;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeDoseUnit(unit?: string | null): string | undefined {
  const raw = normalizeString(unit);
  if (!raw) return undefined;
  return raw.toLowerCase().replace(/\s+/g, '');
}

export function treatmentUnitMatches(treatmentUnit?: string, disciplinareUnit?: string): boolean {
  const normalizedTreatment = normalizeDoseUnit(treatmentUnit);
  const normalizedDisciplinare = normalizeDoseUnit(disciplinareUnit);
  if (!normalizedTreatment || !normalizedDisciplinare) {
    return true;
  }
  return normalizedTreatment === normalizedDisciplinare;
}

export function entryToRecord(entry: DisciplinariEntry): Record<string, string> {
  return entry.data.reduce<Record<string, string>>(
    (accumulator, field) => {
      if (field.type) {
        accumulator[field.type] = field.value;
      }
      return accumulator;
    },
    {} as Record<string, string>,
  );
}
