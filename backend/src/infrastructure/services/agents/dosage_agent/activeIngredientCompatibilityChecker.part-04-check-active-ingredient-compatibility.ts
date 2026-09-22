import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { JobHistoryManager } from './historyCollector';
import { DosageAgentContext } from './context';
import { Label, isFitoLabel } from '../../../../domain/dtos/label.dto';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { ProductWithLabel, UnitCompatibilityCheckResult, extractActiveIngredientFromLabel, extractChemicalFamily } from './activeIngredientCompatibilityChecker.part-01-usage-logger';
import { performRuleBasedCheck } from './activeIngredientCompatibilityChecker.part-03-perform-rule-based-check';
import { LlmCompatibilityResult, invokeLlmCompatibilityCheck } from './activeIngredientCompatibilityChecker.part-02-build-compatibility-prompt';

/**
 * Main function to check active ingredient compatibility for products on a field
 */
export async function checkActiveIngredientCompatibility(
  unit: UnitAllowedProductsWithDosageOutput,
  historyManager?: JobHistoryManager,
  context?: DosageAgentContext,
): Promise<UnitCompatibilityCheckResult> {
  const products = unit.products || [];
  console.log(
    `[COMPATIBILITY-CHECK] Checking ${products.length} products for unit ${unit.unitProductionId}`,
  );

  // Extract products with their labels
  const productsWithLabels: ProductWithLabel[] = products.map((p) => ({
    name: String((p as { name?: string }).name || ''),
    regNumber: String((p as { regNumber?: string }).regNumber || ''),
    label: isFitoLabel((p as { label?: unknown }).label)
      ? ((p as { label: Label }).label as Label)
      : null,
    trattamenti: (p as { trattamenti?: unknown[] }).trattamenti as ProductWithLabel['trattamenti'],
  }));

  if (productsWithLabels.length < 2) {
    console.log('[COMPATIBILITY-CHECK] Less than 2 products, skipping check');
    return {
      unitProductionId: unit.unitProductionId,
      cropName: unit.cropName,
      totalProducts: productsWithLabels.length,
      compatibleProducts: productsWithLabels.length,
      incompatibleProducts: 0,
      substitutesRemoved: 0,
      productResults: productsWithLabels.map((p) => ({
        productName: p.name,
        regNumber: p.regNumber,
        activeIngredient: extractActiveIngredientFromLabel(p.label),
        isCompatible: true,
        incompatibilityReason: null,
        isSubstitute: false,
        substituteFor: null,
        originalDose: p.trattamenti?.[0]?.dose,
        adjustedDose: p.trattamenti?.[0]?.dose ?? 0,
        chemicalFamily: extractChemicalFamily(p.label),
      })),
    };
  }

  // First: rule-based check
  const ruleBasedResults = performRuleBasedCheck(productsWithLabels);

  // Count rule-based incompatibilities
  const ruleBasedIncompatible = Array.from(ruleBasedResults.values()).filter(
    (r) => !r.isCompatible,
  );

  if (ruleBasedIncompatible.length > 0) {
    console.log(
      `[COMPATIBILITY-CHECK] Rule-based check found ${ruleBasedIncompatible.length} incompatibilities`,
    );
  }

  // Second: LLM check for additional analysis
  let llmResults: LlmCompatibilityResult | null = null;
  try {
    llmResults = await invokeLlmCompatibilityCheck(productsWithLabels, context);
  } catch (error) {
    console.warn('[COMPATIBILITY-CHECK] LLM check failed, using rule-based results only');
  }

  // Merge results: LLM takes precedence for additional exclusions
  const finalResults = new Map(ruleBasedResults);

  if (llmResults) {
    for (const llmResult of llmResults.analysis) {
      const key = `${llmResult.productName}|${llmResult.regNumber}`;
      const existing = finalResults.get(key);

      if (llmResult.decision === 'EXCLUDE' && existing) {
        // Skip exclusions based only on being a substitute (same AI) - user chose these products
        if (llmResult.isSubstituteOf !== null && !llmResult.incompatibleWith?.length) {
          console.log(
            `[COMPATIBILITY-CHECK] Ignoring LLM substitute exclusion for "${llmResult.productName}" - user-selected product kept.`,
          );
          continue;
        }
        if (existing.isCompatible) {
          // LLM found actual chemical incompatibility
          finalResults.set(key, {
            ...existing,
            isCompatible: false,
            incompatibilityReason: llmResult.reason,
            isSubstitute: false,
            substituteFor: null,
            adjustedDose: 0,
          });
        }
      }
    }
  }

  // Log to history
  const productResults = Array.from(finalResults.values());
  for (const result of productResults) {
    if (!result.isCompatible && historyManager) {
      const productKey = `${result.productName}|${result.regNumber}`;
      historyManager.addEntry(
        unit.unitProductionId,
        productKey,
        'Prodotto escluso: Incompatibilità principio attivo',
        result.incompatibilityReason || 'Incompatibilità rilevata',
        DosageAgentStep.ACTIVE_INGREDIENT_COMPATIBILITY,
        DataSource.LABEL_EXTRACTION,
        {
          productionUnitId: unit.unitProductionId,
          cropName: unit.cropName,
          variety: unit.variety,
          productName: result.productName,
          productRegistrationNumber: result.regNumber,
          description: `Principio attivo: ${result.activeIngredient || 'N/A'}. Famiglia chimica: ${result.chemicalFamily || 'N/A'}. Dose originale: ${result.originalDose || 'N/A'}, Dose finale: 0`,
        },
      );
    }
  }

  const incompatibleCount = productResults.filter((r) => !r.isCompatible).length;
  const substitutesCount = productResults.filter((r) => r.isSubstitute).length;

  console.log(
    `[COMPATIBILITY-CHECK] Unit ${unit.unitProductionId}: ${incompatibleCount} incompatible, ${substitutesCount} substitutes`,
  );

  return {
    unitProductionId: unit.unitProductionId,
    cropName: unit.cropName,
    totalProducts: productResults.length,
    compatibleProducts: productResults.filter((r) => r.isCompatible).length,
    incompatibleProducts: incompatibleCount,
    substitutesRemoved: substitutesCount,
    productResults,
  };
}
