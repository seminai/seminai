import { Field, ProductionUnit } from '@prisma/client';
import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { JobHistoryManager } from './historyCollector';
import { DosageAgentContext } from './context';
import { type DisciplinariEntry } from '../../tool/getDisciplinariFromBDF';
import { normalizeActiveIngredient as sharedNormalizeAI } from './productAccessors';

// ============================================================================
// TYPES
// ============================================================================

export type NormalizedUnit = Partial<
  ProductionUnit & Partial<Field> & { disciplinari: string[]; cropVariety: string }
>;

export interface FlowValidateSAGroupLimitsParams {
  readonly units: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
  readonly normalizedUnits: ReadonlyArray<NormalizedUnit>;
  readonly historyManager?: JobHistoryManager;
  readonly context?: DosageAgentContext;
}

/**
 * Represents an SA group from the disciplinari dataset
 */
export interface SAGroupInfo {
  readonly groupId: string; // ID_GRUPPO_SA_DISC
  readonly maxTreatments: number; // NUM_MAX_TRATT_GruppoSA
  readonly period: string; // MAX_TRATT_PER_GruppoSA (e.g., "A" = year)
  readonly groupName: string; // NOME (e.g., "IBE", "SDHI")
  readonly description: string; // DESCRIZIONE (list of SA in the group)
  readonly activeIngredients: readonly string[]; // Parsed from DESCRIZIONE
}

/**
 * Treatment count for an SA group within a production unit
 */
export interface SAGroupTreatmentCount {
  readonly groupId: string;
  readonly groupName: string;
  readonly currentCount: number;
  readonly maxAllowed: number;
  readonly period: string;
  readonly contributingProducts: readonly {
    readonly productName: string;
    readonly regNumber: string;
    readonly treatmentCount: number;
  }[];
}

/**
 * An SA-group annual cap exceeded by SUMMING treatments across multiple cycles
 * of the same production unit + season, where no single cycle exceeds it alone.
 */
export interface SAGroupAnnualExceedance {
  readonly groupName: string;
  readonly unitProductionId: string;
  readonly seasonYear: number | null;
  readonly total: number;
  readonly maxAllowed: number;
}

/** Diagnostics surfaced by the SA-group validator (transparency / WARNING-level). */
export interface SAGroupDiagnostics {
  /** Units where SA-group validation could not run (no disciplinari/normalized data). */
  readonly missingDataUnitIds: ReadonlyArray<string>;
  /** Annual (period 'A') caps breached across cycles. */
  readonly annualExceedances: ReadonlyArray<SAGroupAnnualExceedance>;
}

/** RO-RO result: the (possibly dose-adjusted) units plus validation diagnostics. */
export interface SAGroupValidationResult {
  readonly units: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
  readonly diagnostics: SAGroupDiagnostics;
}

export interface AnnualBucket {
  groupName: string;
  unitProductionId: string;
  seasonYear: number | null;
  total: number;
  maxAllowed: number;
  maxPerCycle: number;
}

/**
 * Accumulates per-(unit, season) treatment counts for ANNUAL-scope ('A') groups,
 * so caps that span multiple cycles can be checked. Per-cycle ('C') groups are
 * left to the existing per-entry counting.
 */
export function accumulateAnnualCounts(
  accumulator: Map<string, AnnualBucket>,
  unit: UnitAllowedProductsWithDosageOutput,
  groupCounts: Map<string, SAGroupTreatmentCount>,
): void {
  const seasonYear = typeof unit.seasonYear === 'number' ? unit.seasonYear : null;
  for (const [key, count] of groupCounts) {
    if (count.period !== 'A' || count.currentCount === 0) continue;
    const bucketKey = `${unit.unitProductionId}|${seasonYear ?? 'n/d'}|${key}`;
    const existing = accumulator.get(bucketKey);
    if (existing) {
      existing.total += count.currentCount;
      existing.maxPerCycle = Math.max(existing.maxPerCycle, count.currentCount);
      continue;
    }
    accumulator.set(bucketKey, {
      groupName: count.groupName,
      unitProductionId: unit.unitProductionId,
      seasonYear,
      total: count.currentCount,
      maxAllowed: count.maxAllowed,
      maxPerCycle: count.currentCount,
    });
  }
}

/**
 * Reports annual exceedances ONLY when the cross-cycle sum exceeds the cap AND
 * no single cycle exceeded it alone (the genuine cross-cycle gap; single-cycle
 * breaches are already handled/reported by the per-entry zeroing).
 */
export function buildAnnualExceedances(
  accumulator: Map<string, AnnualBucket>,
): SAGroupAnnualExceedance[] {
  return [...accumulator.values()]
    .filter((b) => b.total > b.maxAllowed && b.maxPerCycle <= b.maxAllowed)
    .map((b) => ({
      groupName: b.groupName,
      unitProductionId: b.unitProductionId,
      seasonYear: b.seasonYear,
      total: b.total,
      maxAllowed: b.maxAllowed,
    }));
}

// ============================================================================
// CACHE (with TTL to prevent unbounded memory growth in long-running workers)
// ============================================================================

export const SA_GROUP_CACHE_TTL_MS = 30 * 60 * 1000;

// 30 minutes
export const SA_GROUP_CACHE_MAX_SIZE = 500;

export interface CacheEntry {
  readonly data: readonly DisciplinariEntry[];
  readonly expiresAt: number;
}

export const saGroupDisciplinariCache = new Map<string, CacheEntry>();

export function getCachedEntry(key: string): readonly DisciplinariEntry[] | undefined {
  const entry = saGroupDisciplinariCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    saGroupDisciplinariCache.delete(key);
    return undefined;
  }
  return entry.data;
}

export function setCachedEntry(key: string, data: readonly DisciplinariEntry[]): void {
  // Evict oldest entries if cache is too large
  if (saGroupDisciplinariCache.size >= SA_GROUP_CACHE_MAX_SIZE) {
    const firstKey = saGroupDisciplinariCache.keys().next().value;
    if (firstKey !== undefined) saGroupDisciplinariCache.delete(firstKey);
  }
  saGroupDisciplinariCache.set(key, { data, expiresAt: Date.now() + SA_GROUP_CACHE_TTL_MS });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// normalizeActiveIngredient imported from shared productAccessors as sharedNormalizeAI

/**
 * Normalizes a region name for comparison
 */
export function normalizeRegionName(value?: string | null): string | undefined {
  if (!value) return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/gi, '')
    .toLowerCase();
}

/**
 * Converts a DisciplinariEntry to a key-value record
 */
export function entryToRecord(entry: DisciplinariEntry): Record<string, string> {
  return entry.data.reduce<Record<string, string>>((accumulator, field) => {
    if (field.type) {
      accumulator[field.type] = field.value;
    }
    return accumulator;
  }, {});
}

// buildProductKey imported from shared productAccessors (normalized, consistent across modules)

/**
 * Extracts SA groups from a DisciplinariEntry
 */
export function extractSAGroups(entry: DisciplinariEntry): readonly SAGroupInfo[] {
  const record = entryToRecord(entry);
  const groupId = record['ID_GRUPPO_SA_DISC']?.trim();
  const maxTreatmentsStr = record['NUM_MAX_TRATT_GruppoSA']?.trim();
  const maxTreatments = maxTreatmentsStr ? parseInt(maxTreatmentsStr, 10) : 0;
  const period = record['MAX_TRATT_PER_GruppoSA']?.trim() || 'A';
  const groupName = record['NOME']?.trim() || '';
  const description = record['DESCRIZIONE']?.trim() || '';

  // Skip if no valid group data
  if (!groupId || !maxTreatments || maxTreatments <= 0 || !Number.isFinite(maxTreatments)) {
    return [];
  }

  // Parse active ingredients from description (e.g., "Bixafen, Fluxapyroxad" -> ["bixafen", "fluxapyroxad"])
  const activeIngredients = description
    .split(',')
    .map((s) => sharedNormalizeAI(s))
    .filter((s) => s.length > 0);

  return [
    {
      groupId,
      maxTreatments,
      period,
      groupName,
      description,
      activeIngredients,
    },
  ];
}

// extractProductActiveIngredients → replaced by shared extractActiveIngredients from productAccessors
// productBelongsToGroup → replaced by shared productBelongsToSAGroup from productAccessors (token-based matching)

/**
 * Extracts a field value from a normalized unit snapshot
 */
export function extractFromSnapshot(
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

/**
 * Builds a map from unitProductionId to NormalizedUnit
 */
export function buildNormalizedUnitsMap(
  normalizedUnits: ReadonlyArray<NormalizedUnit>,
): Map<string, NormalizedUnit> {
  const map = new Map<string, NormalizedUnit>();
  for (const unit of normalizedUnits) {
    if (unit.id) {
      map.set(unit.id, unit);
    }
  }
  return map;
}
