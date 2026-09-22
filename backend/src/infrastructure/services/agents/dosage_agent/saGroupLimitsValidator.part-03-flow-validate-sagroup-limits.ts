import { hasContext } from './context';
import { DosageLoggerService } from '../../dosage-logger.service';
import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { extractProductName, extractProductRegNumber, extractTreatments, buildProductKey } from './productAccessors';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { AnnualBucket, FlowValidateSAGroupLimitsParams, SAGroupValidationResult, accumulateAnnualCounts, buildAnnualExceedances, buildNormalizedUnitsMap, extractFromSnapshot, normalizeRegionName } from './saGroupLimitsValidator.part-01-normalized-unit';
import { buildSAGroupsMap, countTreatmentsByGroup } from './saGroupLimitsValidator.part-02-fetch-disciplinari-entries-with-cache';

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
