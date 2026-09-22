import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { Label, LabelResistance } from '../../../../domain/dtos/label.dto';
import { normalizeActiveIngredient as sharedNormalizeAI, activeIngredientMatches } from './productAccessors';

export const usageLogger = LlmUsageLogger.getInstance();

/**
 * Result of compatibility check for a single product
 */
export interface ProductCompatibilityResult {
  readonly productName: string;
  readonly regNumber: string;
  readonly activeIngredient: string | null;
  readonly isCompatible: boolean;
  readonly incompatibilityReason: string | null;
  readonly isSubstitute: boolean;
  readonly substituteFor: string | null;
  readonly originalDose: number | undefined;
  readonly adjustedDose: number;
  readonly chemicalFamily: string | null;
}

/**
 * Summary of compatibility check for a production unit
 */
export interface UnitCompatibilityCheckResult {
  readonly unitProductionId: string;
  readonly cropName: string | undefined;
  readonly totalProducts: number;
  readonly compatibleProducts: number;
  readonly incompatibleProducts: number;
  readonly substitutesRemoved: number;
  readonly productResults: ReadonlyArray<ProductCompatibilityResult>;
}

export interface ProductWithLabel {
  readonly name: string;
  readonly regNumber: string;
  readonly label: Label | null;
  readonly trattamenti?: ReadonlyArray<{
    readonly dose?: number;
    readonly data_distribuzione?: Date;
    readonly epoca_impiego?: string;
    readonly dosaggio_um?: string;
    readonly [key: string]: unknown;
  }>;
}

/**
 * Extracts active ingredient string directly from a Label object.
 * NOTE: This is distinct from productAccessors.extractActiveIngredient which takes a product.
 */
export function extractActiveIngredientFromLabel(label: Label | null): string | null {
  if (!label) return null;
  return label.principio_attivo?.trim() || null;
}

/**
 * Extracts chemical family from FRAC/MoA code or composition
 */
export function extractChemicalFamily(label: Label | null): string | null {
  if (!label) return null;
  if (label.meccanismo_azione_frac) {
    return label.meccanismo_azione_frac.trim();
  }
  if (label.formulazione) {
    return label.formulazione.trim();
  }
  return null;
}

/**
 * Extracts resistance warnings from label
 */
export function extractResistanceWarnings(label: Label | null): ReadonlyArray<LabelResistance> {
  if (!label || !label.resistenze) return [];
  return label.resistenze;
}

// normalizeActiveIngredient imported from shared productAccessors as sharedNormalizeAI

/**
 * Checks if a product should be avoided based on resistance warnings
 */
export function checkProductInResistanceWarnings(
  productName: string,
  activeIngredient: string | null,
  chemicalFamily: string | null,
  resistances: ReadonlyArray<LabelResistance>,
): { isIncompatible: boolean; reason: string | null } {
  for (const resistance of resistances) {
    // Check products to avoid
    if (resistance.prodotti_da_evitare) {
      for (const avoidProduct of resistance.prodotti_da_evitare) {
        const normAvoid = sharedNormalizeAI(avoidProduct);
        const normProduct = sharedNormalizeAI(productName);
        const normAI = sharedNormalizeAI(activeIngredient);
        if (
          normAvoid &&
          (activeIngredientMatches(normProduct, normAvoid) ||
            (normAI && activeIngredientMatches(normAI, normAvoid)))
        ) {
          return {
            isIncompatible: true,
            reason: `Prodotto "${productName}" contiene principio attivo da evitare: ${avoidProduct}. ${resistance.raccomandazioni || ''}`,
          };
        }
      }
    }
    // Check chemical families to avoid
    if (resistance.famiglie_chimiche_da_evitare && chemicalFamily) {
      for (const avoidFamily of resistance.famiglie_chimiche_da_evitare) {
        const normAvoidFamily = sharedNormalizeAI(avoidFamily);
        const normFamily = sharedNormalizeAI(chemicalFamily);
        if (activeIngredientMatches(normFamily, normAvoidFamily)) {
          return {
            isIncompatible: true,
            reason: `Prodotto "${productName}" appartiene alla famiglia chimica da evitare: ${avoidFamily}. ${resistance.raccomandazioni || ''}`,
          };
        }
      }
    }
  }
  return { isIncompatible: false, reason: null };
}
