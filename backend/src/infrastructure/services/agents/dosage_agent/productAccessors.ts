/**
 * Shared product accessor utilities for the dosage agent pipeline.
 *
 * Centralizes type-safe access to product fields, replacing scattered
 * `as Record<string, unknown>` casts across validation steps.
 */

import { Label, isFitoLabel } from '../../../../domain/dtos/label.dto';

// ============================================================================
// NORMALIZATION
// ============================================================================

/**
 * Normalizes an active ingredient name for comparison:
 * lowercases, removes accents, replaces non-alphanumeric with spaces, trims.
 */
export function normalizeActiveIngredient(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ============================================================================
// PRODUCT FIELD ACCESSORS
// ============================================================================

/**
 * Safely extracts the Label from a product, validated with isFitoLabel.
 */
export function extractLabel(product: unknown): Label | null {
  const candidate = (product as { label?: unknown } | null)?.label;
  if (candidate && isFitoLabel(candidate)) {
    return candidate;
  }
  return null;
}

/**
 * Extracts the product name from a product object.
 */
export function extractProductName(product: unknown): string | null {
  const p = product as { name?: string; productName?: string } | null;
  return p?.name ?? p?.productName ?? null;
}

/**
 * Extracts the registration number from a product object.
 */
export function extractProductRegNumber(product: unknown): string | null {
  const p = product as { regNumber?: string; registrationNumber?: string } | null;
  return p?.regNumber ?? p?.registrationNumber ?? null;
}

/**
 * Extracts the raw active ingredient string from a product's label.
 * Returns the full string (e.g., "Metalaxyl-M + Mancozeb").
 */
export function extractActiveIngredient(product: unknown): string | null {
  const label = extractLabel(product);
  if (label?.principio_attivo) {
    return label.principio_attivo;
  }
  const p = product as { activeIngredient?: string; principio_attivo?: string } | null;
  return p?.activeIngredient ?? p?.principio_attivo ?? null;
}

/**
 * Extracts and splits active ingredients from a product's label.
 * Handles multi-ingredient products separated by `+` or `,`.
 * Returns normalized names.
 */
export function extractActiveIngredients(product: unknown): readonly string[] {
  const raw = extractActiveIngredient(product);
  if (!raw) return [];
  return raw
    .split(/[+,]/)
    .map((s) => normalizeActiveIngredient(s))
    .filter((s) => s.length > 0);
}

// ============================================================================
// TREATMENT ACCESSORS
// ============================================================================

/** Minimal typed view of a treatment record */
export interface TreatmentView {
  readonly dose?: number;
  readonly dosaggio_um?: string;
  readonly data_distribuzione?: string | Date;
  readonly epoca_impiego?: string;
  readonly application?: string | null;
  readonly note?: string;
  readonly [key: string]: unknown;
}

/**
 * Extracts treatments from a product object, returning a typed readonly array.
 */
export function extractTreatments(product: unknown): ReadonlyArray<TreatmentView> {
  const p = product as { trattamenti?: unknown } | null;
  if (!p?.trattamenti || !Array.isArray(p.trattamenti)) return [];
  return p.trattamenti as ReadonlyArray<TreatmentView>;
}

/**
 * Returns only treatments with dose > 0.
 */
export function getActiveTreatments(product: unknown): ReadonlyArray<TreatmentView> {
  return extractTreatments(product).filter((t) => (t.dose ?? 0) > 0);
}

// ============================================================================
// PRODUCT KEY
// ============================================================================

/**
 * Builds a normalized, consistent product key for Map lookups.
 * All modules must use this single implementation to avoid key mismatches
 * caused by differences in casing, accents, or formatting.
 */
export function buildProductKey(name: string, regNumber: string): string {
  const normalizedName = normalizeActiveIngredient(name);
  const normalizedReg = regNumber.trim().toLowerCase().replace(/\s+/g, '');
  return `${normalizedName}|${normalizedReg}`;
}

/**
 * Builds a stable key for disciplinare info scoped by active ingredient and crop.
 * Prevents cross-crop contamination when the same active ingredient is used on
 * different production units within the same job.
 */
export function buildDisciplinareInfoKey(activeIngredient: string, cropName: string): string {
  return `${normalizeActiveIngredient(activeIngredient)}|${normalizeActiveIngredient(cropName)}`;
}

// ============================================================================
// EPOCA IMPIEGO MATCHING
// ============================================================================

/**
 * Scores the match between two epoca_impiego strings using bidirectional
 * token overlap. Prevents false positives like "fioritura" matching "pre-fioritura".
 *
 * Returns a score between 0 and 1 where:
 * - 1.0 = exact match
 * - 0.7+ = strong match (most tokens shared)
 * - < 0.5 = weak match (significant token mismatch)
 */
export function scoreEpocaMatch(labelEpoca: string, treatmentEpoca: string): number {
  const a = labelEpoca.toLowerCase().trim();
  const b = treatmentEpoca.toLowerCase().trim();

  if (a === b) return 1.0;
  if (!a || !b) return 0;

  // Split on whitespace, commas, hyphens, slashes — filter stopwords (length <= 2)
  const tokensA = a.split(/[\s,\-/]+/).filter((t) => t.length > 2);
  const tokensB = b.split(/[\s,\-/]+/).filter((t) => t.length > 2);

  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  // Forward: what fraction of treatment tokens appear in label?
  const forwardMatches = tokensB.filter((t) => tokensA.includes(t)).length;
  const forwardScore = forwardMatches / tokensB.length;

  // Reverse: what fraction of label tokens appear in treatment?
  const reverseMatches = tokensA.filter((t) => tokensB.includes(t)).length;
  const reverseScore = reverseMatches / tokensA.length;

  // Geometric mean: penalizes one-sided matches
  // e.g., "fioritura" vs "pre-fioritura" → forward=1.0, reverse=0.5 → 0.71
  //        "fioritura" vs "fioritura"      → forward=1.0, reverse=1.0 → 1.0
  return Math.sqrt(forwardScore * reverseScore);
}

// ============================================================================
// ACTIVE INGREDIENT MATCHING
// ============================================================================

/**
 * Token-based matching for active ingredient names.
 *
 * Compares normalized AI names using word tokens instead of raw substring matching.
 * This prevents false positives like "rame" matching "rametto".
 *
 * Match rules:
 * - Exact match: "bixafen" === "bixafen"
 * - Token-prefix match: "metalaxyl" matches "metalaxyl m" (all tokens of shorter
 *   name appear as a prefix of the longer name)
 */
export function activeIngredientMatches(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  const tokensA = a.split(/\s+/);
  const tokensB = b.split(/\s+/);

  // All tokens of the shorter name must appear as a prefix sequence of the longer name.
  // "rame" (1 token) matches "rame ossicloruro" (2 tokens) because tokensA[0] === tokensB[0]
  // "rame" does NOT match "rametto" because "rame" !== "rametto"
  if (tokensA.length <= tokensB.length) {
    return tokensA.every((t, i) => tokensB[i] === t);
  }
  return tokensB.every((t, i) => tokensA[i] === t);
}

/**
 * Checks if a product's active ingredients match any AI in a group.
 * Uses token-based matching instead of substring includes.
 */
export function productBelongsToSAGroup(
  productAIs: readonly string[],
  groupAIs: readonly string[],
): boolean {
  return productAIs.some((pAI) => groupAIs.some((gAI) => activeIngredientMatches(pAI, gAI)));
}
