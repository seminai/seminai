import { normalizeActiveIngredient as sharedNormalizeAI } from './productAccessors';
import { ProductCompatibilityResult, ProductWithLabel, checkProductInResistanceWarnings, extractActiveIngredientFromLabel, extractChemicalFamily, extractResistanceWarnings } from './activeIngredientCompatibilityChecker.part-01-usage-logger';

/**
 * Performs rule-based compatibility check before LLM
 */
export function performRuleBasedCheck(
  products: ReadonlyArray<ProductWithLabel>,
): Map<string, ProductCompatibilityResult> {
  const results = new Map<string, ProductCompatibilityResult>();
  const activeIngredients = new Map<string, ProductWithLabel[]>();

  // Group products by normalized active ingredient
  for (const product of products) {
    const ai = extractActiveIngredientFromLabel(product.label);
    const normalizedAI = sharedNormalizeAI(ai);
    const key = `${product.name}|${product.regNumber}`;

    if (normalizedAI) {
      if (!activeIngredients.has(normalizedAI)) {
        activeIngredients.set(normalizedAI, []);
      }
      activeIngredients.get(normalizedAI)!.push(product);
    }

    // Initialize result
    results.set(key, {
      productName: product.name,
      regNumber: product.regNumber,
      activeIngredient: ai,
      isCompatible: true,
      incompatibilityReason: null,
      isSubstitute: false,
      substituteFor: null,
      originalDose: product.trattamenti?.[0]?.dose,
      adjustedDose: product.trattamenti?.[0]?.dose ?? 0,
      chemicalFamily: extractChemicalFamily(product.label),
    });
  }

  // Log shared active ingredients as informational note (do NOT exclude - user chose these products)
  for (const [normalizedAI, productsWithSameAI] of activeIngredients) {
    if (productsWithSameAI.length > 1) {
      const names = productsWithSameAI.map((p) => p.name);
      console.log(
        `[COMPATIBILITY-CHECK] Info: ${productsWithSameAI.length} products share active ingredient "${normalizedAI}": ${names.join(', ')}. Keeping all as user-selected.`,
      );
    }
  }

  // Check resistance warnings for each product against all others
  for (const product of products) {
    const resistances = extractResistanceWarnings(product.label);
    if (resistances.length === 0) continue;

    for (const otherProduct of products) {
      if (product.name === otherProduct.name && product.regNumber === otherProduct.regNumber) {
        continue;
      }

      const otherAI = extractActiveIngredientFromLabel(otherProduct.label);
      const otherCF = extractChemicalFamily(otherProduct.label);
      const check = checkProductInResistanceWarnings(
        otherProduct.name,
        otherAI,
        otherCF,
        resistances,
      );

      if (check.isIncompatible) {
        const key = `${otherProduct.name}|${otherProduct.regNumber}`;
        const existing = results.get(key);
        if (existing && existing.isCompatible) {
          results.set(key, {
            ...existing,
            isCompatible: false,
            incompatibilityReason: check.reason,
            adjustedDose: 0,
          });
        }
      }
    }
  }

  return results;
}
