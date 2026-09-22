import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LlmCacheService } from './llmCacheService';
import { prisma } from '../../../repositories/Prisma';
import { z } from 'zod';
import { UnitAllowedProductsOutput } from './flowMatchCropTreatment';
import { Label, isFitoLabel } from '../../../../domain/dtos/label.dto';
import type { OrchestratorConfig, ExcludedProduct } from './types';

export const usageLogger = LlmUsageLogger.getInstance();

export const llmCacheService = new LlmCacheService(prisma, 5);

export const ORCHESTRATOR_SELECTION_PROMPT_VERSION = 'orchestrator-selection-v3';

/**
 * Schema per la motivazione di esclusione di un singolo prodotto
 */
export const ExcludedProductReasonSchema = z.object({
  index: z.number().int().min(1).describe('1-based index of excluded product'),
  reason: z
    .string()
    .describe(
      'Specific reason why this product was excluded (e.g., redundant coverage, no stock, lower priority)',
    ),
});

/**
 * Schema LLM per la selezione prodotti con motivazioni di esclusione
 */
export const LlmProductSelectionSchema = z.object({
  selectedIndices: z.array(z.number().int().min(1)).describe('1-based indices of products to keep'),
  reason: z
    .string()
    .optional()
    .nullable()
    .describe('Short general explanation of selection strategy'),
  excludedProducts: z
    .array(ExcludedProductReasonSchema)
    .describe(
      'REQUIRED: For EVERY product NOT in selectedIndices, provide the index and a specific reason for exclusion',
    ),
});

export type LlmProductSelection = z.infer<typeof LlmProductSelectionSchema>;

/**
 * Default limits based on intensity level
 */
export const INTENSITY_DEFAULTS: Record<'low' | 'medium' | 'high', { maxProductsPerUnit: number }> = {
  low: { maxProductsPerUnit: 3 },
  medium: { maxProductsPerUnit: 6 },
  high: { maxProductsPerUnit: 10 },
};

/**
 * Default category priority (higher index = higher priority)
 */
export const DEFAULT_CATEGORY_PRIORITY: string[] = [
  'acaricide',
  'molluscicide',
  'nematicide',
  'herbicide',
  'insecticide',
  'fungicide',
];

export interface ProductFeatures {
  readonly product: UnitAllowedProductsOutput['products'][number];
  readonly name: string;
  readonly category: string | null;
  readonly targets: string[];
  readonly frac: string | null;
  readonly hasStock: boolean;
  readonly estimatedApplications: number;
}

/**
 * Summary statistics from orchestration
 */
export interface OrchestrationSummary {
  readonly totalUnits: number;
  readonly totalOriginalProducts: number;
  readonly totalSelectedProducts: number;
  readonly totalRemovedProducts: number;
  readonly estimatedJobs: number;
  readonly reductionPercentage: number;
}

/**
 * Extracts label from product
 */
export function extractLabel(product: UnitAllowedProductsOutput['products'][number]): Label | null {
  const label = (product as { label?: unknown }).label;
  return label && isFitoLabel(label) ? label : null;
}

/**
 * Extracts category from label (normalized)
 */
export function extractCategory(label: Label | null): string | null {
  if (!label?.categoria) return null;
  const cat = label.categoria.toLowerCase();
  if (cat.includes('fungicid')) return 'fungicide';
  if (cat.includes('insetticid') || cat.includes('insecticid')) return 'insecticide';
  if (cat.includes('erbicid') || cat.includes('herbicid') || cat.includes('diserbant'))
    return 'herbicide';
  if (cat.includes('acaricid')) return 'acaricide';
  if (cat.includes('mollusc')) return 'molluscicide';
  if (cat.includes('nematocid') || cat.includes('nematicid')) return 'nematicide';
  return 'other';
}

/**
 * Extracts FRAC/IRAC/HRAC code from label for resistance management
 */
export function extractMoaCode(label: Label | null): string | null {
  if (!label) return null;
  const moa = label.meccanismo_azione_frac?.trim();
  if (moa) return moa;
  // Note: label.resistenze is a structured object (LabelResistance[]), not a FRAC/IRAC code.
  // We intentionally do not infer FRAC/IRAC from that field to avoid incorrect grouping.
  return null;
}

/**
 * Extracts target diseases/pests from label
 */
export function extractTargets(label: Label | null): string[] {
  if (!label) return [];
  const targets: string[] = [];
  if (label.malattie) targets.push(...label.malattie);
  if (label.specie) targets.push(...label.specie);
  // Also check dosaggi_dettagliati for malattia field
  if (label.dosaggi_dettagliati) {
    for (const d of label.dosaggi_dettagliati) {
      if (d.malattia) targets.push(d.malattia);
    }
  }
  return [...new Set(targets.map((t) => t.toLowerCase().trim()))];
}

/**
 * Estimates number of applications based on label constraints
 */
export function estimateApplications(
  label: Label | null,
  maxApplicationsPerProduct: number | null,
): number {
  if (!label?.dosaggi_dettagliati || label.dosaggi_dettagliati.length === 0) {
    return 1;
  }
  // Find the max applications allowed by label
  const labelMaxApps = Math.max(...label.dosaggi_dettagliati.map((d) => d.n_max_applicazioni ?? 1));
  // If config does not define an extra cap, rely only on label
  if (maxApplicationsPerProduct === null) {
    return labelMaxApps;
  }
  // Otherwise, return the minimum between label limit and config limit
  return Math.min(labelMaxApps, maxApplicationsPerProduct);
}

export function buildProductFeatures(
  product: UnitAllowedProductsOutput['products'][number],
  config: OrchestratorConfig,
): ProductFeatures {
  const label = extractLabel(product);
  const category = extractCategory(label);
  const moa = extractMoaCode(label);
  const targets = extractTargets(label);
  const quantity = (product as { quantity?: number }).quantity ?? 0;
  const hasStock = quantity > 0;
  const maxAppsConfig =
    typeof config.maxApplicationsPerProductPerUnit === 'number'
      ? config.maxApplicationsPerProductPerUnit
      : null;
  const estimatedApplications = estimateApplications(label, maxAppsConfig);
  const name = String((product as { name?: string }).name || '');
  return {
    product,
    name,
    category,
    targets,
    frac: moa,
    hasStock,
    estimatedApplications,
  };
}

export interface FallbackSelectionResult {
  readonly selected: ReadonlyArray<UnitAllowedProductsOutput['products'][number]>;
  readonly excluded: ReadonlyArray<ExcludedProduct>;
}

export function pickFallbackProducts(
  unit: UnitAllowedProductsOutput,
  config: OrchestratorConfig,
): FallbackSelectionResult {
  const products = unit.products || [];
  const maxProducts =
    typeof config.maxProductsPerUnit === 'number'
      ? config.maxProductsPerUnit
      : config.intensity
        ? INTENSITY_DEFAULTS[config.intensity].maxProductsPerUnit
        : products.length;
  const selected = products.slice(0, maxProducts);
  const excludedProducts = products.slice(maxProducts);
  const excluded: ExcludedProduct[] = excludedProducts.map((product, idx) => {
    const name = String((product as { name?: string }).name || '');
    const regNumber = String((product as { regNumber?: string }).regNumber || '');
    const label = extractLabel(product);
    const category = extractCategory(label);
    return {
      index: maxProducts + idx + 1,
      name,
      regNumber,
      exclusionReason: `Limite massimo prodotti raggiunto (${maxProducts}): priorità inferiore rispetto ai prodotti selezionati`,
      category,
      product,
    };
  });
  return { selected, excluded };
}

/**
 * Result of LLM product selection including excluded products with reasons
 */
export interface LlmSelectionResult {
  readonly selected: ReadonlyArray<UnitAllowedProductsOutput['products'][number]>;
  readonly excluded: ReadonlyArray<ExcludedProduct>;
  readonly reason: string | null;
}
