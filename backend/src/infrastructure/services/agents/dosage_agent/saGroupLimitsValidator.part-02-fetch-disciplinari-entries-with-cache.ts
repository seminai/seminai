import { getDisciplinariFromBDF, type DisciplinariEntry } from '../../tool/getDisciplinariFromBDF';
import { extractActiveIngredients, extractProductName, extractProductRegNumber, extractTreatments, productBelongsToSAGroup, buildProductKey } from './productAccessors';
import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { SAGroupInfo, SAGroupTreatmentCount, entryToRecord, extractSAGroups, getCachedEntry, normalizeRegionName, setCachedEntry } from './saGroupLimitsValidator.part-01-normalized-unit';

/**
 * Fetches disciplinari entries for a product with caching
 */
export async function fetchDisciplinariEntriesWithCache(
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
export async function buildSAGroupsMap(
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
export function countTreatmentsByGroup(
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
