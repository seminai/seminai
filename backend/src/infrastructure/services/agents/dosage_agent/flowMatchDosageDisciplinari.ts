import { Field, Prisma, ProductionUnit, LlmJobType } from '@prisma/client';
import nodeGeocoder, { Entry as GeocoderEntry, Options as GeocoderOptions } from 'node-geocoder';
import { PromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { JobHistoryManager } from './historyCollector';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { getDisciplinariFromBDF, type DisciplinariEntry } from '../../tool/getDisciplinariFromBDF';
import { prisma } from '../../../repositories/Prisma';
import { checkRevocationWithFallback } from './disciplinariRevocationChecker';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import type { DisciplinariContext } from './types';
import { createChatModel } from '../../llm-model-factory';

const usageLogger = LlmUsageLogger.getInstance();

type NormalizedUnit = Partial<
  ProductionUnit & Partial<Field> & { disciplinari: string[]; cropVariety: string }
>;

interface FlowMatchDosageDisciplinariParams {
  readonly units: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
  readonly normalizedUnits: ReadonlyArray<NormalizedUnit>;
  readonly historyManager?: JobHistoryManager;
  readonly disciplinariContext?: DisciplinariContext;
}

interface DoseLimit {
  readonly productName: string;
  readonly regNumber: string;
  readonly maxDose?: number;
  readonly minDose?: number;
  readonly unitOfMeasure?: string;
  readonly regionLabel?: string;
}

interface DoseSearchContext {
  readonly diseases: ReadonlyArray<string>;
  readonly agronomicNotes?: string;
  readonly priorityTargets?: ReadonlyArray<string>;
}

enum RegionSource {
  FIELD = 'field',
  FIELD_GEOCODED = 'field_geocoded',
  COMPANY_GEOCODED = 'company_geocoded',
  PROVINCE_LOOKUP = 'province_lookup',
  CITY_GEOCODED = 'city_geocoded',
  UNKNOWN = 'unknown',
}

interface RegionResolution {
  readonly regionLabel?: string;
  readonly normalizedRegion?: string;
  readonly source: RegionSource;
  readonly companyName?: string;
}

interface RegionLookupInput {
  readonly address?: string;
  readonly city?: string;
  readonly cap?: string;
  readonly province?: string;
  readonly nation?: string;
}

interface RegionLookupResult extends RegionResolution {
  readonly addressUsed?: string;
}

const GEOCODER_OPTIONS: GeocoderOptions = {
  provider: 'openstreetmap',
  timeout: 5000,
};

const geocoder = nodeGeocoder(GEOCODER_OPTIONS);
const geocodeCache = new Map<string, string | null>();
const unitRegionCache = new Map<string, RegionResolution>();
const disciplinariCache = new Map<string, readonly DisciplinariEntry[]>();

const PROVINCE_TO_REGION: Record<string, string> = {
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

function normalizeString(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

function normalizeSearchToken(value?: string): string | undefined {
  const normalized = normalizeString(value);
  if (!normalized) return undefined;
  return normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeRegionName(value?: string | null): string | undefined {
  const raw = normalizeString(value);
  if (!raw) return undefined;
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/gi, '')
    .toLowerCase();
}

function normalizeProvinceCode(value?: string | null): string | undefined {
  const raw = normalizeString(value);
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^a-z]/gi, '');
  if (cleaned.length !== 2) return undefined;
  return cleaned.toUpperCase();
}

function extractProvinceCode(value?: string | null): string | undefined {
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

function buildProductKey(name: string, regNumber: string): string {
  const normalizedName = normalizeRegionName(name) ?? '';
  return `${normalizedName}|${regNumber.trim()}`;
}

function parseDoseValue(value?: string): number | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\./g, '').replace(/,/g, '.').trim();
  if (!normalized) return undefined;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeDoseUnit(unit?: string | null): string | undefined {
  const raw = normalizeString(unit);
  if (!raw) return undefined;
  return raw.toLowerCase().replace(/\s+/g, '');
}

function treatmentUnitMatches(treatmentUnit?: string, disciplinareUnit?: string): boolean {
  const normalizedTreatment = normalizeDoseUnit(treatmentUnit);
  const normalizedDisciplinare = normalizeDoseUnit(disciplinareUnit);
  if (!normalizedTreatment || !normalizedDisciplinare) {
    return true;
  }
  return normalizedTreatment === normalizedDisciplinare;
}

function entryToRecord(entry: DisciplinariEntry): Record<string, string> {
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

function extractDiseasesFromLabel(product: unknown): string[] {
  const label = (product as { label?: unknown }).label;
  if (!label || typeof label !== 'object') return [];
  const dosageDetails = (label as { dosaggi_dettagliati?: unknown[] }).dosaggi_dettagliati;
  if (!Array.isArray(dosageDetails)) return [];
  const diseases = dosageDetails
    .map((detail) => (detail as { malattia?: string }).malattia)
    .filter(
      (disease): disease is string => typeof disease === 'string' && disease.trim().length > 0,
    )
    .map((disease) => disease.trim());
  return [...new Set(diseases)];
}

function buildEnrichedQueryContext(context: DoseSearchContext): string {
  const parts: string[] = [];
  if (context.diseases.length > 0) {
    parts.push(`Diseases: ${context.diseases.join(', ')}`);
  }
  if (context.priorityTargets && context.priorityTargets.length > 0) {
    parts.push(`Priority targets: ${context.priorityTargets.join(', ')}`);
  }
  if (context.agronomicNotes) {
    parts.push(`Agronomic notes: ${context.agronomicNotes}`);
  }
  return parts.join('. ');
}

function recordMatchesDisease(
  record: Record<string, string>,
  diseases: ReadonlyArray<string>,
): boolean {
  if (diseases.length === 0) return false;
  const diseaseTokens = diseases
    .map((disease) => normalizeSearchToken(disease))
    .filter((disease): disease is string => Boolean(disease));
  if (diseaseTokens.length === 0) return false;
  const diseaseValues = Object.entries(record)
    .filter(([key, value]) => {
      if (!value) return false;
      return /(AVVERS|MALAT|PATO|TARGET|ORGANISMO|PARASS)/i.test(key);
    })
    .map(([, value]) => normalizeSearchToken(value))
    .filter((value): value is string => Boolean(value));
  if (diseaseValues.length === 0) return false;
  return diseaseTokens.some((token) => diseaseValues.some((value) => value.includes(token)));
}

function prioritizeRecordsByDisease(
  records: ReadonlyArray<Record<string, string>>,
  diseases: ReadonlyArray<string>,
): ReadonlyArray<Record<string, string>> {
  if (records.length === 0 || diseases.length === 0) return records;
  const diseaseMatched = records.filter((record) => recordMatchesDisease(record, diseases));
  if (diseaseMatched.length === 0) return records;
  return diseaseMatched;
}

function isDisciplinareEnabled(record: Record<string, string>): boolean {
  const value =
    record.SA_DISCIPLINARE ??
    record.sa_disciplinare ??
    record.SA_disciplinare ??
    record.sa_disciplinare ??
    '';
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'si';
}

const RegionMatchSchema = z.object({
  isMatch: z.boolean().describe("Se l'indirizzo appartiene alla regione del disciplinare"),
  confidence: z.number().min(0).max(100).describe('Livello di confidenza del match (0-100)'),
  reason: z
    .string()
    .describe("Breve spiegazione del perché l'indirizzo appartiene o non appartiene alla regione"),
});

type RegionMatchResult = z.infer<typeof RegionMatchSchema>;

const regionMatchParser = StructuredOutputParser.fromZodSchema(RegionMatchSchema);

async function llmMatchAddressToRegion(
  address: string,
  disciplinareRegion: string,
): Promise<RegionMatchResult> {
  const { model: llm } = createChatModel({
    modelName: 'gpt-4o-mini',
    temperature: 0,
    maxTokens: 300,
  });

  const prompt = PromptTemplate.fromTemplate(`
Sei un esperto geografico italiano. Devi determinare se un indirizzo italiano appartiene a una specifica regione italiana.

INDIRIZZO: {address}

REGIONE DEL DISCIPLINARE: {region}

REGOLE PER IL MATCHING:
1. Confronta l'indirizzo con la regione indicata
2. Considera che le regioni italiane possono essere scritte in modi diversi:
   - "Emilia-Romagna" = "Emilia Romagna"
   - "Trentino-Alto Adige" = "Trentino Alto Adige"
   - "Friuli-Venezia Giulia" = "Friuli Venezia Giulia"
   - "Valle d'Aosta" = "Valle dAosta" = "Val dAosta"
3. Se l'indirizzo contiene il nome della regione (o una sua variante) → isMatch = true
4. Se l'indirizzo contiene una città/provincia che appartiene alla regione → isMatch = true
5. Se non c'è relazione → isMatch = false

CONFIDENZA:
- 90-100: Match diretto (nome regione esplicito nell'indirizzo)
- 70-89: Match per città/provincia nota appartenente alla regione
- 50-69: Match probabile ma incerto
- <50: Nessun match chiaro

{format_instructions}

Rispondi SOLO con il JSON richiesto, senza testo aggiuntivo.
`);

  const usageAccumulator = new UsageAccumulator();
  const usageCollector = new LangChainUsageCollector(usageAccumulator);
  const chain = prompt.pipe(llm).pipe(regionMatchParser);

  try {
    const result = await chain.invoke(
      {
        address,
        region: disciplinareRegion,
        format_instructions: regionMatchParser.getFormatInstructions(),
      },
      { callbacks: [usageCollector] },
    );

    // Log usage asynchronously
    usageLogger
      .logFromAccumulator(usageAccumulator, {
        jobType: LlmJobType.DOSAGE,
        model: 'gpt-4o-mini',
        metadata: {
          step: 'disciplinari-address-region-match',
          address,
          region: disciplinareRegion,
        },
      })
      .catch((err) => console.warn('[DISCIPLINARI-LLM] Failed to log usage:', err));

    return result;
  } catch (error) {
    console.warn(
      `[DISCIPLINARI-LLM] Errore nel matching LLM per indirizzo "${address}" e regione "${disciplinareRegion}":`,
      error instanceof Error ? error.message : String(error),
    );
    return {
      isMatch: false,
      confidence: 0,
      reason: `Errore nel matching LLM: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function selectDoseLimit(
  entries: readonly DisciplinariEntry[],
  normalizedRegion?: string,
  addressForLLM?: string,
  historyManager?: JobHistoryManager,
  unitId?: string,
  productKey?: string,
  historyMetadata?: Parameters<JobHistoryManager['addEntry']>[6],
  context?: DoseSearchContext,
): Promise<DoseLimit | undefined> {
  if (entries.length === 0) {
    return undefined;
  }
  const prioritizedRecords: Record<string, string>[] = [];
  const generalRecords: Record<string, string>[] = [];
  const llmMatchedRecords: Record<string, string>[] = [];
  let skippedNonDisciplined = 0;
  for (const entry of entries) {
    const record = entryToRecord(entry);
    if (!isDisciplinareEnabled(record)) {
      skippedNonDisciplined += 1;
      continue;
    }
    const entryRegion = normalizeRegionName(record.DECO_REGIONE);
    const entryRegionLabel = record.DECO_REGIONE;
    if (normalizedRegion && entryRegion === normalizedRegion) {
      prioritizedRecords.push(record);
    } else if (!entryRegion || entryRegion === 'nazionale') {
      generalRecords.push(record);
    } else if (
      addressForLLM &&
      entryRegionLabel &&
      normalizedRegion &&
      entryRegion !== normalizedRegion
    ) {
      const llmResult = await llmMatchAddressToRegion(addressForLLM, entryRegionLabel);
      if (llmResult.isMatch && llmResult.confidence >= 70) {
        llmMatchedRecords.push(record);
        if (historyManager && unitId && productKey) {
          const metadata = historyMetadata
            ? {
                ...historyMetadata,
                description: `Indirizzo: ${addressForLLM}. ${llmResult.reason}`,
              }
            : { description: `Indirizzo: ${addressForLLM}. ${llmResult.reason}` };
          historyManager.addEntry(
            unitId,
            productKey,
            'Match regione disciplinare via LLM',
            `${entryRegionLabel} (confidence: ${llmResult.confidence}%)`,
            DosageAgentStep.DISCIPLINARI_VALIDATION,
            DataSource.LLM_OPENAI,
            metadata,
          );
        }
      }
    }
  }
  const recordsByRegion =
    prioritizedRecords.length > 0
      ? prioritizedRecords
      : llmMatchedRecords.length > 0
        ? llmMatchedRecords
        : generalRecords;
  if (recordsByRegion.length === 0) {
    if (skippedNonDisciplined > 0 && historyManager && unitId && productKey) {
      historyManager.addEntry(
        unitId,
        productKey,
        'Prodotto non soggetto a disciplinari regionali',
        'SA_DISCIPLINARE=false',
        DosageAgentStep.DISCIPLINARI_VALIDATION,
        DataSource.BDF_DATABASE,
        historyMetadata,
      );
    }
    return undefined;
  }
  const records = prioritizeRecordsByDisease(recordsByRegion, context?.diseases ?? []);
  const maxCandidates: number[] = [];
  const minCandidates: number[] = [];
  let unit: string | undefined;
  let productName = '';
  let regNumber = '';
  let regionLabel: string | undefined;
  for (const record of records) {
    const recordMaxValues = [record.DOSE_MAX, record.DOSE_MAX_2, record.DOSE];
    const recordMinValues = [record.DOSE_MIN, record.DOSE_MIN_2];
    recordMaxValues.forEach((value) => {
      const parsed = parseDoseValue(value);
      if (typeof parsed === 'number') {
        maxCandidates.push(parsed);
      }
    });
    recordMinValues.forEach((value) => {
      const parsed = parseDoseValue(value);
      if (typeof parsed === 'number') {
        minCandidates.push(parsed);
      }
    });
    if (!unit) {
      unit = normalizeString(record.DECODIFICA) ?? normalizeString(record.DECODIFICA_2);
    }
    if (!productName && record.NOME_COMMERCIALE) {
      productName = record.NOME_COMMERCIALE;
    }
    if (!regNumber && record.NUM_REG) {
      regNumber = record.NUM_REG;
    }
    if (!regionLabel && record.DECO_REGIONE) {
      regionLabel = record.DECO_REGIONE;
    }
  }
  if (maxCandidates.length === 0 && minCandidates.length === 0) {
    return undefined;
  }
  const maxDose = maxCandidates.length > 0 ? Math.min(...maxCandidates) : undefined;
  const minDose = minCandidates.length > 0 ? Math.max(...minCandidates) : undefined;
  return {
    productName,
    regNumber,
    maxDose,
    minDose,
    unitOfMeasure: unit,
    regionLabel,
  };
}

async function fetchDisciplinariEntries(
  productName: string,
  regNumber: string,
): Promise<readonly DisciplinariEntry[]> {
  const cacheKey = buildProductKey(productName, regNumber);
  if (disciplinariCache.has(cacheKey)) {
    return disciplinariCache.get(cacheKey) ?? [];
  }
  const entries = await getDisciplinariFromBDF({
    productName,
    registrationNumber: regNumber,
  });
  disciplinariCache.set(cacheKey, entries);
  return entries;
}

function extractUnitId(unit: NormalizedUnit): string | undefined {
  const idCandidate =
    normalizeString((unit as { id?: string }).id) ??
    normalizeString((unit as { idApp?: string }).idApp);
  if (!idCandidate) {
    return undefined;
  }
  return idCandidate;
}

function extractFromSnapshot(
  unit: NormalizedUnit | undefined,
  fieldName: string,
): string | undefined {
  if (!unit) return undefined;
  const value = (unit as Record<string, unknown>)[fieldName];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

function extractProvinceFromSnapshot(unit: NormalizedUnit | undefined): string | undefined {
  return (
    extractFromSnapshot(unit, 'province') ??
    extractFromSnapshot(unit, 'provincia') ??
    extractProvinceCode(extractFromSnapshot(unit, 'city'))
  );
}

function buildAddressString(parts: ReadonlyArray<string | undefined> = []): string | undefined {
  const filtered = parts.filter(
    (part) => typeof part === 'string' && part.trim().length > 0,
  ) as string[];
  if (filtered.length === 0) {
    return undefined;
  }
  return filtered.join(', ');
}

async function geocodeRegion(address: string): Promise<string | undefined> {
  const cacheKey = address.toLowerCase();
  if (geocodeCache.has(cacheKey)) {
    const cached = geocodeCache.get(cacheKey);
    return cached ?? undefined;
  }
  try {
    const results: GeocoderEntry[] = await geocoder.geocode(address);
    const region =
      results[0]?.administrativeLevels?.level1long ??
      results[0]?.state ??
      results[0]?.county ??
      null;
    geocodeCache.set(cacheKey, region);
    return region ?? undefined;
  } catch (error) {
    console.warn(
      `[DISCIPLINARI] Geocoding failed for address "${address}":`,
      error instanceof Error ? error.message : String(error),
    );
    geocodeCache.set(cacheKey, null);
    return undefined;
  }
}

class RegionLookupService {
  public async findRegion(input: RegionLookupInput): Promise<RegionLookupResult | undefined> {
    const provinceRegion =
      this.mapProvinceToRegion(input.province) ||
      this.mapProvinceToRegion(extractProvinceCode(input.city));
    if (provinceRegion) {
      return {
        regionLabel: provinceRegion,
        normalizedRegion: normalizeRegionName(provinceRegion),
        source: RegionSource.PROVINCE_LOOKUP,
      };
    }
    const address = buildAddressString([
      normalizeString(input.address),
      normalizeString(input.city),
      normalizeProvinceCode(input.province) ?? extractProvinceCode(input.city),
      normalizeString(input.cap),
      normalizeString(input.nation) ?? 'Italia',
    ]);
    if (address) {
      const region = await geocodeRegion(address);
      if (region) {
        return {
          regionLabel: region,
          normalizedRegion: normalizeRegionName(region),
          source: RegionSource.FIELD_GEOCODED,
          addressUsed: address,
        };
      }
    }
    const cityQuery = buildAddressString([
      normalizeString(input.city),
      normalizeProvinceCode(input.province) ?? extractProvinceCode(input.city),
      normalizeString(input.nation) ?? 'Italia',
    ]);
    if (cityQuery) {
      const cityRegion = await geocodeRegion(cityQuery);
      if (cityRegion) {
        return {
          regionLabel: cityRegion,
          normalizedRegion: normalizeRegionName(cityRegion),
          source: RegionSource.CITY_GEOCODED,
          addressUsed: cityQuery,
        };
      }
    }
    return undefined;
  }

  private mapProvinceToRegion(province?: string | null): string | undefined {
    const code = normalizeProvinceCode(province);
    if (!code) return undefined;
    return PROVINCE_TO_REGION[code];
  }
}

const regionLookupService = new RegionLookupService();

type ProductionUnitWithFields = Prisma.ProductionUnitGetPayload<{
  include: {
    productionUnitsOnFields: {
      include: {
        field: {
          select: {
            region: true;
            city: true;
            address: true;
            cap: true;
            nation: true;
            company: {
              select: {
                name: true;
                city: true;
                address: true;
                cap: true;
                nation: true;
              };
            };
          };
        };
      };
    };
  };
}>;

async function fetchUnitRegionFromDatabase(unitProductionId: string): Promise<RegionResolution> {
  const unitRecord: ProductionUnitWithFields | null = await prisma.productionUnit.findUnique({
    where: { id: unitProductionId },
    include: {
      productionUnitsOnFields: {
        include: {
          field: {
            select: {
              region: true,
              city: true,
              address: true,
              cap: true,
              nation: true,
              company: {
                select: {
                  name: true,
                  city: true,
                  address: true,
                  cap: true,
                  nation: true,
                },
              },
            },
          },
        },
      },
    },
  });
  const relation = unitRecord?.productionUnitsOnFields?.[0];
  const field = relation?.field;
  const company = field?.company;

  if (field?.region) {
    const normalized = normalizeRegionName(field.region);
    return {
      regionLabel: field.region,
      normalizedRegion: normalized,
      source: RegionSource.FIELD,
      companyName: company?.name ?? undefined,
    };
  }
  const fieldResolution = await regionLookupService.findRegion({
    address: normalizeString(field?.address),
    city: normalizeString(field?.city),
    cap: normalizeString(field?.cap),
    province: extractProvinceCode(field?.city),
    nation: normalizeString(field?.nation) ?? 'Italia',
  });
  if (fieldResolution) {
    return {
      ...fieldResolution,
      companyName: company?.name ?? undefined,
    };
  }
  const companyResolution = await regionLookupService.findRegion({
    address: normalizeString(company?.address),
    city: normalizeString(company?.city),
    cap: normalizeString(company?.cap),
    province: extractProvinceCode(company?.city),
    nation: normalizeString(company?.nation) ?? 'Italia',
  });
  if (companyResolution) {
    const adjustedSource =
      companyResolution.source === RegionSource.PROVINCE_LOOKUP
        ? RegionSource.PROVINCE_LOOKUP
        : RegionSource.COMPANY_GEOCODED;
    return {
      ...companyResolution,
      source: adjustedSource,
      companyName: company?.name ?? undefined,
    };
  }
  return {
    source: RegionSource.UNKNOWN,
  };
}

async function resolveUnitRegion(
  unitProductionId: string,
  normalizedUnit: NormalizedUnit | undefined,
): Promise<RegionResolution & { address?: string }> {
  if (unitRegionCache.has(unitProductionId)) {
    const cached = unitRegionCache.get(unitProductionId)!;
    return { ...cached, address: undefined };
  }
  const snapshotRegion =
    extractFromSnapshot(normalizedUnit, 'region') || extractFromSnapshot(normalizedUnit, 'regione');
  if (snapshotRegion) {
    const resolution: RegionResolution = {
      regionLabel: snapshotRegion,
      normalizedRegion: normalizeRegionName(snapshotRegion),
      source: RegionSource.FIELD,
    };
    unitRegionCache.set(unitProductionId, resolution);
    const address = buildAddressString([
      extractFromSnapshot(normalizedUnit, 'address'),
      extractFromSnapshot(normalizedUnit, 'city'),
      extractProvinceFromSnapshot(normalizedUnit),
      extractFromSnapshot(normalizedUnit, 'cap'),
      extractFromSnapshot(normalizedUnit, 'nation') ?? 'Italia',
    ]);
    return { ...resolution, address: address };
  }
  const lookupInput: RegionLookupInput = {
    address: extractFromSnapshot(normalizedUnit, 'address'),
    city: extractFromSnapshot(normalizedUnit, 'city'),
    cap: extractFromSnapshot(normalizedUnit, 'cap'),
    province: extractProvinceFromSnapshot(normalizedUnit),
    nation: extractFromSnapshot(normalizedUnit, 'nation') ?? 'Italia',
  };
  const snapshotLookup = await regionLookupService.findRegion(lookupInput);
  if (snapshotLookup) {
    const { addressUsed, ...resolution } = snapshotLookup;
    unitRegionCache.set(unitProductionId, resolution);
    return { ...resolution, address: addressUsed };
  }
  const dbResolution = await fetchUnitRegionFromDatabase(unitProductionId);
  unitRegionCache.set(unitProductionId, dbResolution);
  return { ...dbResolution, address: undefined };
}

async function resolveUnitAddress(
  unitProductionId: string,
  normalizedUnit: NormalizedUnit | undefined,
): Promise<string | undefined> {
  const snapshotAddress = buildAddressString([
    extractFromSnapshot(normalizedUnit, 'address'),
    extractFromSnapshot(normalizedUnit, 'city'),
    extractProvinceFromSnapshot(normalizedUnit),
    extractFromSnapshot(normalizedUnit, 'cap'),
    extractFromSnapshot(normalizedUnit, 'nation') ?? 'Italia',
  ]);
  if (snapshotAddress) {
    return snapshotAddress;
  }
  try {
    const unitRecord: ProductionUnitWithFields | null = await prisma.productionUnit.findUnique({
      where: { id: unitProductionId },
      include: {
        productionUnitsOnFields: {
          include: {
            field: {
              select: {
                address: true,
                city: true,
                cap: true,
                nation: true,
                company: {
                  select: {
                    address: true,
                    city: true,
                    cap: true,
                    nation: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    const relation = unitRecord?.productionUnitsOnFields?.[0];
    const field = relation?.field;
    const fieldAddress = buildAddressString([
      field?.address ?? undefined,
      field?.city ?? undefined,
      extractProvinceCode(field?.city),
      field?.cap ?? undefined,
      field?.nation ?? 'Italia',
    ]);
    if (fieldAddress) {
      return fieldAddress;
    }
    const company = field?.company;
    const companyAddress = buildAddressString([
      company?.address ?? undefined,
      company?.city ?? undefined,
      extractProvinceCode(company?.city),
      company?.cap ?? undefined,
      company?.nation ?? 'Italia',
    ]);
    return companyAddress;
  } catch (error) {
    console.warn(
      `[DISCIPLINARI] Errore nel recupero indirizzo per unità ${unitProductionId}:`,
      error instanceof Error ? error.message : String(error),
    );
    return undefined;
  }
}

function appendHistoryNote(
  historyManager: JobHistoryManager | undefined,
  unitId: string,
  productKey: string,
  title: string,
  value: string,
  metadata: Parameters<JobHistoryManager['addEntry']>[6],
): void {
  if (!historyManager) {
    return;
  }
  historyManager.addEntry(
    unitId,
    productKey,
    title,
    value,
    DosageAgentStep.DISCIPLINARI_VALIDATION,
    DataSource.BDF_DATABASE,
    metadata,
  );
}

function buildHistoryMetadata(
  unit: UnitAllowedProductsWithDosageOutput,
  product: UnitAllowedProductsWithDosageOutput['products'][number],
): Parameters<JobHistoryManager['addEntry']>[6] {
  return {
    productionUnitId: unit.unitProductionId,
    cropName: unit.cropName,
    variety: unit.variety,
    areaHa: unit.areaHa,
    productName: String((product as { name?: string }).name || ''),
    productRegistrationNumber: String((product as { regNumber?: string }).regNumber || ''),
  };
}

type ReadonlyTreatment = NonNullable<
  UnitAllowedProductsWithDosageOutput['products'][number]['trattamenti']
>[number];

type MutableTreatment = {
  data_distribuzione?: Date;
  dose?: number;
  epoca_impiego?: string;
  isLocalizedTreatment?: boolean;
  note?: string;
  dosaggio_um?: string;
};

function cloneTreatments(
  trattamenti: ReadonlyArray<ReadonlyTreatment> | undefined,
): MutableTreatment[] {
  if (!trattamenti) return [];
  return trattamenti.map((treatment) => ({ ...treatment }));
}

function annotateTreatmentNote(treatment: MutableTreatment, message: string): void {
  if (!message) return;
  const separator = treatment.note ? ' ' : '';
  treatment.note = `${treatment.note ?? ''}${separator}${message}`.trim();
}

export const flowMatchDosageDisciplinari = async (
  params: FlowMatchDosageDisciplinariParams,
): Promise<ReadonlyArray<UnitAllowedProductsWithDosageOutput>> => {
  const { units, normalizedUnits, historyManager, disciplinariContext } = params;
  console.log(
    `[DISCIPLINARI] Avvio ottimizzazione disciplinari per ${units.length} unità produttive`,
  );
  const normalizedMap = new Map<string, NormalizedUnit>();
  normalizedUnits.forEach((unit) => {
    const unitId = extractUnitId(unit);
    if (unitId) {
      normalizedMap.set(unitId, unit);
    }
  });

  const optimizedUnits: UnitAllowedProductsWithDosageOutput[] = [];
  for (const unit of units) {
    const normalizedUnit = normalizedMap.get(unit.unitProductionId);
    const regionInfo = await resolveUnitRegion(unit.unitProductionId, normalizedUnit);
    if (!regionInfo.regionLabel) {
      console.warn(
        `[DISCIPLINARI] Regione non determinata per unità ${unit.unitProductionId}. Verrà saltata la verifica disciplinari.`,
      );
    }
    const optimizedProducts: Array<UnitAllowedProductsWithDosageOutput['products'][number]> = [];
    for (const product of unit.products || []) {
      const productName = String((product as { name?: string }).name || '');
      const regNumber = String((product as { regNumber?: string }).regNumber || '');
      const productKey = buildProductKey(productName, regNumber);
      if (!productName || !regNumber) {
        optimizedProducts.push(product);
        continue;
      }
      if (!product.trattamenti || product.trattamenti.length === 0) {
        optimizedProducts.push(product);
        continue;
      }
      if (!regionInfo.regionLabel || !regionInfo.normalizedRegion) {
        optimizedProducts.push(product);
        continue;
      }
      if (regionInfo.source === RegionSource.COMPANY_GEOCODED) {
        historyManager?.addEntry(
          unit.unitProductionId,
          productKey,
          'Regione disciplinare risolta da azienda',
          regionInfo.regionLabel,
          DosageAgentStep.DISCIPLINARI_VALIDATION,
          DataSource.USER_INPUT,
          {
            ...buildHistoryMetadata(unit, product),
            companyName: regionInfo.companyName,
            description: 'Regione derivata tramite geocoding indirizzo aziendale',
          },
        );
      }
      const disciplinariEntries = await fetchDisciplinariEntries(productName, regNumber);
      if (disciplinariEntries.length === 0) {
        optimizedProducts.push(product);
        historyManager?.addEntry(
          unit.unitProductionId,
          productKey,
          'Prodotto non presente nei disciplinari BDF',
          'Nessun record trovato',
          DosageAgentStep.DISCIPLINARI_VALIDATION,
          DataSource.BDF_DATABASE,
          buildHistoryMetadata(unit, product),
        );
        continue;
      }

      // Check revocation status for the product
      const treatmentDates = (product.trattamenti || [])
        .map((t) => t.data_distribuzione)
        .filter((d): d is Date => d instanceof Date);
      const earliestApplicationDate =
        treatmentDates.length > 0
          ? new Date(Math.min(...treatmentDates.map((d) => d.getTime())))
          : new Date();

      const revocationStatus = await checkRevocationWithFallback(
        productName,
        regNumber,
        earliestApplicationDate,
        disciplinariEntries,
        regionInfo.normalizedRegion,
      );

      // If product is revoked/expired, set dose to 0, annotate treatments and log to history
      if (revocationStatus.isRevoked) {
        const clonedTreatmentsForRevocation = cloneTreatments(product.trattamenti);
        clonedTreatmentsForRevocation.forEach((treatment) => {
          treatment.dose = 0; // Set quantity to zero for revoked products
          annotateTreatmentNote(treatment, `[REVOCA] ${revocationStatus.reason}`);
        });

        // Determine the appropriate DataSource based on revocation source
        const revocationDataSource =
          revocationStatus.source === 'ministerial_dataset'
            ? DataSource.MINISTERIAL_DATASET
            : revocationStatus.source === 'tavily_search'
              ? DataSource.TAVILY_SEARCH
              : DataSource.BDF_DATABASE;

        historyManager?.addEntry(
          unit.unitProductionId,
          productKey,
          'Prodotto revocato o scaduto',
          revocationStatus.reason,
          DosageAgentStep.DISCIPLINARI_VALIDATION,
          revocationDataSource,
          {
            ...buildHistoryMetadata(unit, product),
            description: revocationStatus.sourceUrl
              ? `Fonte: ${revocationStatus.sourceUrl}`
              : `Fonte: ${revocationStatus.source}`,
          },
        );

        console.log(
          `[DISCIPLINARI] Prodotto ${productName} (${regNumber}) risulta revocato/scaduto: ${revocationStatus.reason}`,
        );

        // Keep product but with revocation annotation
        optimizedProducts.push({
          ...product,
          trattamenti: clonedTreatmentsForRevocation as ReadonlyArray<
            NonNullable<
              UnitAllowedProductsWithDosageOutput['products'][number]['trattamenti']
            >[number]
          >,
        });
        continue;
      }

      const unitAddress =
        regionInfo.address ?? (await resolveUnitAddress(unit.unitProductionId, normalizedUnit));
      const diseases = extractDiseasesFromLabel(product);
      const searchContext: DoseSearchContext = {
        diseases,
        agronomicNotes: disciplinariContext?.agronomicNotes,
        priorityTargets: disciplinariContext?.priorityTargets,
      };
      const enrichedContext = buildEnrichedQueryContext(searchContext);
      if (enrichedContext) {
        console.log(
          `[DISCIPLINARI] Contesto ricerca (${productName} ${regNumber}): ${enrichedContext}`,
        );
      }
      const historyMetadata = buildHistoryMetadata(unit, product);
      const baseDescription = historyMetadata?.description;
      const contextAwareMetadata = enrichedContext
        ? {
            ...historyMetadata,
            description: baseDescription
              ? `${baseDescription}. Context: ${enrichedContext}`
              : `Context: ${enrichedContext}`,
          }
        : historyMetadata;
      const limit = await selectDoseLimit(
        disciplinariEntries,
        regionInfo.normalizedRegion,
        unitAddress,
        historyManager,
        unit.unitProductionId,
        productKey,
        contextAwareMetadata,
        searchContext,
      );
      if (!limit || limit.maxDose === undefined) {
        optimizedProducts.push(product);
        historyManager?.addEntry(
          unit.unitProductionId,
          productKey,
          'Disciplinare disponibile ma senza limiti di dose per la regione',
          regionInfo.regionLabel ?? 'N/A',
          DosageAgentStep.DISCIPLINARI_VALIDATION,
          DataSource.BDF_DATABASE,
          contextAwareMetadata,
        );
        continue;
      }
      const clonedTreatments = cloneTreatments(product.trattamenti);
      let adjustments = 0;
      clonedTreatments.forEach((treatment, index) => {
        if (typeof treatment.dose !== 'number') {
          return;
        }
        if (!treatmentUnitMatches(treatment.dosaggio_um, limit.unitOfMeasure)) {
          return;
        }
        if (treatment.dose > (limit.maxDose ?? Number.POSITIVE_INFINITY)) {
          const previousDose = treatment.dose;
          treatment.dose = limit.maxDose!;
          annotateTreatmentNote(
            treatment,
            `[DISCIPLINARE] Dose ridotta da ${previousDose} a ${limit.maxDose} ${limit.unitOfMeasure || treatment.dosaggio_um || ''}`,
          );
          adjustments += 1;
          appendHistoryNote(
            historyManager,
            unit.unitProductionId,
            productKey,
            `Applicazione #${index + 1} adeguata al disciplinare`,
            `${previousDose} → ${limit.maxDose} ${limit.unitOfMeasure || treatment.dosaggio_um || ''}`,
            {
              ...contextAwareMetadata,
              description: `Regione: ${regionInfo.regionLabel || 'N/A'}. Fonte disciplina: ${limit.regionLabel || 'N/A'}.`,
            },
          );
        }
      });
      if (adjustments > 0) {
        console.log(
          `[DISCIPLINARI] Ridotte ${adjustments} applicazioni per prodotto ${productName} (${regNumber}) sull'unità ${unit.unitProductionId}`,
        );
      }
      optimizedProducts.push({
        ...product,
        trattamenti: clonedTreatments as ReadonlyArray<
          NonNullable<
            UnitAllowedProductsWithDosageOutput['products'][number]['trattamenti']
          >[number]
        >,
      });
    }
    optimizedUnits.push({
      ...unit,
      products: optimizedProducts,
    });
  }
  return optimizedUnits;
};
