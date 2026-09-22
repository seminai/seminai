/**
 * SA Group Limits Validator
 *
 * Validates the maximum number of treatments per active substance (SA) group
 * according to disciplinari BDF dataset. This is a complementary check to
 * activeIngredientCompatibilityChecker.ts which handles chemical compatibility.
 */

import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { JobHistoryManager } from './historyCollector';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { DosageAgentContext, hasContext } from './context';
import { getDisciplinariFromBDF, type DisciplinariEntry } from '../../tool/getDisciplinariFromBDF';
import { DosageLoggerService } from '../../dosage-logger.service';
import { Field, ProductionUnit } from '@prisma/client';
import {
  normalizeActiveIngredient as sharedNormalizeAI,
  extractActiveIngredients,
  extractProductName,
  extractProductRegNumber,
  extractTreatments,
  productBelongsToSAGroup,
  buildProductKey,
} from './productAccessors';

// ============================================================================
// TYPES
// ============================================================================

type NormalizedUnit = Partial<
  ProductionUnit & Partial<Field> & { disciplinari: string[]; cropVariety: string }
>;

interface FlowValidateSAGroupLimitsParams {
  readonly units: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
  readonly normalizedUnits: ReadonlyArray<NormalizedUnit>;
  readonly historyManager?: JobHistoryManager;
  readonly context?: DosageAgentContext;
}

/**
 * Represents an SA group from the disciplinari dataset
 */
interface SAGroupInfo {
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

const SA_GROUP_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const SA_GROUP_CACHE_MAX_SIZE = 500;

interface CacheEntry {
  readonly data: readonly DisciplinariEntry[];
  readonly expiresAt: number;
}

const saGroupDisciplinariCache = new Map<string, CacheEntry>();

function getCachedEntry(key: string): readonly DisciplinariEntry[] | undefined {
  const entry = saGroupDisciplinariCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    saGroupDisciplinariCache.delete(key);
    return undefined;
  }
  return entry.data;
}

function setCachedEntry(key: string, data: readonly DisciplinariEntry[]): void {
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
function normalizeRegionName(value?: string | null): string | undefined {
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
function entryToRecord(entry: DisciplinariEntry): Record<string, string> {
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
function extractSAGroups(entry: DisciplinariEntry): readonly SAGroupInfo[] {
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

/**
 * Builds a map from unitProductionId to NormalizedUnit
 */
function buildNormalizedUnitsMap(
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

/**
 * Fetches disciplinari entries for a product with caching
 */
async function fetchDisciplinariEntriesWithCache(
  productName: string,
  regNumber: string,
): Promise<readonly DisciplinariEntry[]> {
  const cacheKey = buildProductKey(productName, regNumber);
  const cached = getCachedEntry(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const entries = await getDisciplinariFromBDF({
      productName,
      registrationNumber: regNumber,
    });
    setCachedEntry(cacheKey, entries);
    return entries;
  } catch (error) {
    console.warn(
      `[SA-GROUP-LIMITS] Error fetching disciplinari for ${productName} (${regNumber}):`,
      error instanceof Error ? error.message : String(error),
    );
    setCachedEntry(cacheKey, []);
    return [];
  }
}

// ============================================================================
// CORE LOGIC
// ============================================================================

/**
 * Builds a map of SA groups for all products in a unit, optionally filtered by region
 */
async function buildSAGroupsMap(
  products: ReadonlyArray<UnitAllowedProductsWithDosageOutput['products'][number]>,
  normalizedRegion?: string,
): Promise<Map<string, SAGroupInfo>> {
  const groupsMap = new Map<string, SAGroupInfo>();

  for (const product of products) {
    const name = extractProductName(product) ?? '';
    const regNumber = extractProductRegNumber(product) ?? '';

    if (!name || !regNumber) continue;

    const entries = await fetchDisciplinariEntriesWithCache(name, regNumber);

    for (const entry of entries) {
      // Filter by region if specified
      const record = entryToRecord(entry);
      const entryRegion = normalizeRegionName(record['DECO_REGIONE']);
      if (normalizedRegion && entryRegion && entryRegion !== normalizedRegion) {
        continue;
      }

      const groups = extractSAGroups(entry);
      for (const group of groups) {
        // Use groupId + groupName as key to avoid duplicates
        const key = `${group.groupId}|${group.groupName}`;
        if (!groupsMap.has(key)) {
          groupsMap.set(key, group);
        }
      }
    }
  }

  return groupsMap;
}

/**
 * Counts treatments per SA group for a production unit
 */
function countTreatmentsByGroup(
  products: ReadonlyArray<UnitAllowedProductsWithDosageOutput['products'][number]>,
  saGroupsMap: Map<string, SAGroupInfo>,
): Map<string, SAGroupTreatmentCount> {
  const counts = new Map<string, SAGroupTreatmentCount>();

  // Initialize all groups
  for (const [key, group] of saGroupsMap) {
    counts.set(key, {
      groupId: group.groupId,
      groupName: group.groupName,
      currentCount: 0,
      maxAllowed: group.maxTreatments,
      period: group.period,
      contributingProducts: [],
    });
  }

  // Count treatments for each product
  for (const product of products) {
    const name = extractProductName(product) ?? '';
    const regNumber = extractProductRegNumber(product) ?? '';
    const trattamenti = extractTreatments(product);

    // Only count treatments with dose > 0
    const activeTreatments = trattamenti.filter((t) => (t.dose ?? 0) > 0).length;
    if (activeTreatments === 0) continue;

    const productAIs = extractActiveIngredients(product);

    for (const [key, group] of saGroupsMap) {
      if (productBelongsToSAGroup(productAIs, group.activeIngredients)) {
        const existing = counts.get(key)!;
        counts.set(key, {
          ...existing,
          currentCount: existing.currentCount + activeTreatments,
          contributingProducts: [
            ...existing.contributingProducts,
            { productName: name, regNumber, treatmentCount: activeTreatments },
          ],
        });
      }
    }
  }

  return counts;
}

// ============================================================================
// MAIN FLOW
// ============================================================================

/**
 * Main flow to validate SA group limits for all production units.
 *
 * This flow checks the maximum number of treatments allowed per active substance group
 * (NUM_MAX_TRATT_GruppoSA) from the disciplinari BDF dataset. It runs AFTER
 * flowCheckActiveIngredientCompatibility to ensure accurate treatment counts.
 *
 * When a group exceeds its limit, products are prioritized by user order (first = highest priority).
 * The first N treatments (up to the limit) are kept, excess treatments are zeroed with dose=0.
 * Products not found in the disciplinari dataset are passed through unchanged.
 */
export async function flowValidateSAGroupLimits(
  params: FlowValidateSAGroupLimitsParams,
): Promise<SAGroupValidationResult> {
  const { units, normalizedUnits, historyManager, context } = params;
  const logger = hasContext(context) ? DosageLoggerService.getInstance() : null;

  console.log(`[SA-GROUP-LIMITS] Starting SA group limits validation for ${units.length} units`);
  const startTime = performance.now();

  const normalizedMap = buildNormalizedUnitsMap(normalizedUnits);
  const result: UnitAllowedProductsWithDosageOutput[] = [];
  const missingDataUnitIds: string[] = [];
  const annualAccumulator = new Map<string, AnnualBucket>();
  let totalViolations = 0;

  for (const unit of units) {
    const normalizedUnit = normalizedMap.get(unit.unitProductionId);
    if (!normalizedUnit) {
      console.warn(
        `[SA-GROUP-LIMITS] No normalized unit found for ${unit.unitProductionId}. Skipping SA group validation.`,
      );
      missingDataUnitIds.push(unit.unitProductionId);
      result.push(unit);
      continue;
    }

    // Get region from normalized unit
    const regionLabel =
      extractFromSnapshot(normalizedUnit, 'region') ||
      extractFromSnapshot(normalizedUnit, 'regione');

    if (!regionLabel) {
      console.warn(
        `[SA-GROUP-LIMITS] No region found for unit ${unit.unitProductionId}. SA group filtering may be inaccurate.`,
      );
    }

    const normalizedRegion = normalizeRegionName(regionLabel);

    // 1. Build SA groups map for this unit
    const saGroupsMap = await buildSAGroupsMap(unit.products || [], normalizedRegion);

    if (saGroupsMap.size === 0) {
      // No SA group data in disciplinari for these products
      console.log(`[SA-GROUP-LIMITS] No SA groups found for unit ${unit.unitProductionId}`);
      missingDataUnitIds.push(unit.unitProductionId);
      result.push(unit);
      continue;
    }

    // 2. Count treatments per SA group
    const groupCounts = countTreatmentsByGroup(unit.products || [], saGroupsMap);

    // Accumulate annual ('A') counts across cycles of the same unit+season.
    accumulateAnnualCounts(annualAccumulator, unit, groupCounts);

    // Log groups with violations
    for (const [, count] of groupCounts) {
      if (count.currentCount > count.maxAllowed) {
        console.log(
          `[SA-GROUP-LIMITS] Unit ${unit.unitProductionId}: Group ${count.groupName} has ${count.currentCount}/${count.maxAllowed} treatments`,
        );
      }
    }

    // 3. For over-limit groups, determine how many treatments each product can keep.
    // Products earlier in the list (user order) have higher priority and keep their treatments first.
    const productKeepLimits = new Map<string, { maxKeep: number; violationNotes: string[] }>();

    for (const [, count] of groupCounts) {
      if (count.currentCount <= count.maxAllowed) continue;

      let remaining = count.maxAllowed;

      // Contributing products are in insertion order (user priority)
      for (const cp of count.contributingProducts) {
        const productKey = buildProductKey(cp.productName, cp.regNumber);
        const canKeep = Math.max(0, Math.min(cp.treatmentCount, remaining));
        remaining -= canKeep;

        const violationNote = `[LIMITE GRUPPO SA] Gruppo ${count.groupName}: ${count.currentCount}/${count.maxAllowed} trattamenti`;

        const existing = productKeepLimits.get(productKey);
        if (existing) {
          // Take the stricter limit across all groups
          productKeepLimits.set(productKey, {
            maxKeep: Math.min(existing.maxKeep, canKeep),
            violationNotes: [...existing.violationNotes, violationNote],
          });
        } else {
          productKeepLimits.set(productKey, {
            maxKeep: canKeep,
            violationNotes: [violationNote],
          });
        }
      }
    }

    // 4. Apply corrections: keep first N active treatments per product, zero out the rest
    const updatedProducts: UnitAllowedProductsWithDosageOutput['products'][number][] = [];

    for (const product of unit.products || []) {
      const name = extractProductName(product) ?? '';
      const regNumber = extractProductRegNumber(product) ?? '';
      const productKey = buildProductKey(name, regNumber);
      const limit = productKeepLimits.get(productKey);

      if (!limit) {
        // Product not in any over-limit group — shallow copy to avoid shared mutable references
        updatedProducts.push({
          ...product,
          trattamenti: [...extractTreatments(product)],
        } as typeof product);
        continue;
      }

      const trattamenti = extractTreatments(product);
      const activeTreatmentCount = trattamenti.filter((t) => (t.dose ?? 0) > 0).length;
      const violationNote = limit.violationNotes.join('; ');

      if (limit.maxKeep >= activeTreatmentCount) {
        // All active treatments fit within the limit - add info note only
        const updatedTrattamenti = trattamenti.map((t) => ({
          ...t,
          note: `${t.note || ''} ${violationNote}`.trim(),
        }));
        updatedProducts.push({
          ...product,
          trattamenti: updatedTrattamenti as typeof product.trattamenti,
        } as typeof product);
      } else {
        // Need to zero excess treatments - keep first N active, zero the rest
        const zeroedCount = activeTreatmentCount - limit.maxKeep;
        console.log(
          `[SA-GROUP-LIMITS] ${name} (${regNumber}): keeping ${limit.maxKeep}/${activeTreatmentCount} treatments, zeroing ${zeroedCount}`,
        );
        totalViolations++;

        let keptCount = 0;
        const updatedTrattamenti = trattamenti.map((t) => {
          const isActive = (t.dose ?? 0) > 0;

          if (isActive && keptCount < limit.maxKeep) {
            // Keep this treatment within the limit
            keptCount++;
            return {
              ...t,
              note: `${t.note || ''} ${violationNote}`.trim(),
            };
          } else if (isActive) {
            // Zero this excess treatment
            return {
              ...t,
              dose: 0,
              note: `${t.note || ''} ${violationNote} [RIMOSSO] Dose azzerata per rispetto limite gruppo SA.`.trim(),
            };
          }

          return t; // Already inactive, leave as-is
        });

        updatedProducts.push({
          ...product,
          trattamenti: updatedTrattamenti as typeof product.trattamenti,
        } as typeof product);

        // Log to history
        if (historyManager) {
          historyManager.addEntry(
            unit.unitProductionId,
            productKey,
            'Superato limite trattamenti gruppo SA',
            violationNote,
            DosageAgentStep.DISCIPLINARI_VALIDATION,
            DataSource.BDF_DATABASE,
            {
              productionUnitId: unit.unitProductionId,
              cropName: unit.cropName,
              variety: unit.variety,
              productName: name,
              productRegistrationNumber: regNumber,
              description: `Mantenuti ${limit.maxKeep}/${activeTreatmentCount} trattamenti. ${limit.violationNotes
                .map((n) => n.replace('[LIMITE GRUPPO SA] ', ''))
                .join('. ')}`,
            },
          );
        }
      }
    }

    result.push({
      ...unit,
      products: updatedProducts as typeof unit.products,
    });
  }

  const elapsed = Math.round(performance.now() - startTime);
  const annualExceedances = buildAnnualExceedances(annualAccumulator);
  console.log(
    `[SA-GROUP-LIMITS] Completed in ${elapsed}ms. Total violations: ${totalViolations}; ` +
      `annual cross-cycle exceedances: ${annualExceedances.length}; missing-data units: ${missingDataUnitIds.length}`,
  );

  // Log to service
  if (logger && context) {
    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: `SA Group limits validation completed for ${units.length} units`,
      metadata: {
        unitsProcessed: units.length,
        totalViolations,
        annualExceedances: annualExceedances.length,
        missingDataUnits: missingDataUnitIds.length,
        elapsedMs: elapsed,
      },
    });
  }

  return { units: result, diagnostics: { missingDataUnitIds, annualExceedances } };
}
