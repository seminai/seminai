import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { JobHistoryManager } from './historyCollector';
import { DosageAgentContext, hasContext } from './context';
import { DosageLoggerService } from '../../dosage-logger.service';
import { ProductCompatibilityResult, UnitCompatibilityCheckResult } from './activeIngredientCompatibilityChecker.part-01-usage-logger';
import { checkActiveIngredientCompatibility } from './activeIngredientCompatibilityChecker.part-04-check-active-ingredient-compatibility';

/**
 * Applies compatibility check results to unit products, setting dose to 0 for incompatible products
 */
export function applyCompatibilityResults(
  unit: UnitAllowedProductsWithDosageOutput,
  checkResult: UnitCompatibilityCheckResult,
): UnitAllowedProductsWithDosageOutput {
  const incompatibleMap = new Map(
    checkResult.productResults
      .filter((r) => !r.isCompatible)
      .map((r) => [`${r.productName}|${r.regNumber}`, r]),
  );

  if (incompatibleMap.size === 0) {
    return unit;
  }

  const updatedProducts = (unit.products || []).map((product) => {
    const name = String((product as { name?: string }).name || '');
    const regNumber = String((product as { regNumber?: string }).regNumber || '');
    const key = `${name}|${regNumber}`;
    const incompatibleResult = incompatibleMap.get(key);

    if (!incompatibleResult) {
      return product;
    }

    // Set all treatments to dose 0 with note explaining why
    const trattamenti = (product as { trattamenti?: ReadonlyArray<Record<string, unknown>> })
      .trattamenti;
    if (!trattamenti || trattamenti.length === 0) {
      return product;
    }

    const updatedTrattamenti = trattamenti.map((t) => ({
      ...t,
      dose: 0,
      note: buildExclusionNote(incompatibleResult, t.note as string | undefined),
    }));

    return {
      ...product,
      trattamenti: updatedTrattamenti,
    };
  });

  return {
    ...unit,
    products: updatedProducts,
  };
}

/**
 * Builds the exclusion note for a treatment
 */
export function buildExclusionNote(result: ProductCompatibilityResult, existingNote?: string): string {
  const parts: string[] = [];

  if (existingNote) {
    parts.push(existingNote);
  }

  parts.push(`[ESCLUSO] Incompatibilità principio attivo. ${result.incompatibilityReason || ''}`);
  parts.push('Dose impostata a 0 per storico e tracciabilità.');

  return parts.join(' ');
}

/**
 * Main flow function to check and apply compatibility for all units
 */
export async function flowCheckActiveIngredientCompatibility(
  units: ReadonlyArray<UnitAllowedProductsWithDosageOutput>,
  historyManager?: JobHistoryManager,
  context?: DosageAgentContext,
): Promise<ReadonlyArray<UnitAllowedProductsWithDosageOutput>> {
  console.log(`[COMPATIBILITY-FLOW] Starting compatibility check for ${units.length} units`);
  const startTime = Date.now();

  const results: UnitAllowedProductsWithDosageOutput[] = [];

  for (const unit of units) {
    const checkResult = await checkActiveIngredientCompatibility(unit, historyManager, context);
    const adjustedUnit = applyCompatibilityResults(unit, checkResult);
    results.push(adjustedUnit);
  }

  const elapsed = Date.now() - startTime;
  console.log(`[COMPATIBILITY-FLOW] Completed in ${elapsed}ms`);

  if (hasContext(context)) {
    const logger = DosageLoggerService.getInstance();
    const totalExcluded = results.reduce((sum, r) => {
      const excludedCount = (r.products || []).filter((p) => {
        const trattamenti = (p as { trattamenti?: ReadonlyArray<{ dose?: number }> }).trattamenti;
        return trattamenti?.every((t) => t.dose === 0);
      }).length;
      return sum + excludedCount;
    }, 0);

    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: `Active ingredient compatibility check completed`,
      metadata: {
        unitsProcessed: units.length,
        totalExcluded,
        elapsedMs: elapsed,
      },
    });
  }

  return results;
}
