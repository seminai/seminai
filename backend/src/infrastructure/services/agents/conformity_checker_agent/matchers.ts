import { Label, LabelDoseDetail, isFitoLabel } from '../../../../domain/dtos/label.dto';
import type { ProductWithLabel, LabelMap } from './types';
import { cleanRegNumber } from '../dosage_agent/cleanRegNumber';
import { findCropTaxonomyContext, CropTaxonomyContext } from '../dosage_agent/cropTaxonomyProvider';
import { llmMatchProductToCrop } from '../dosage_agent/llmCropMatcher';

/** Minimum confidence threshold for LLM crop authorization */
const LLM_CONFIDENCE_THRESHOLD = 50;

/**
 * Normalizes a string for comparison (lowercase, trimmed)
 */
function normalizeString(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().trim();
}

/**
 * Builds an array of possible crop keys for matching, including taxonomy variants.
 * Returns normalized keys for: cropName, variety, commonName, genus, species, agronomicCategory.
 */
function buildCropMatchKeys(
  cropName?: string | null,
  variety?: string | null,
): ReadonlyArray<string> {
  const keys = new Set<string>();
  const normalizedCrop = normalizeString(cropName);
  const normalizedVariety = normalizeString(variety);
  if (normalizedCrop) {
    keys.add(normalizedCrop);
  }
  if (normalizedVariety) {
    keys.add(normalizedVariety);
  }
  const taxonomy = findCropTaxonomyContext(cropName ?? '', variety ?? '');
  if (taxonomy) {
    if (taxonomy.commonName) {
      keys.add(normalizeString(taxonomy.commonName));
    }
    if (taxonomy.genus) {
      keys.add(normalizeString(taxonomy.genus));
    }
    if (taxonomy.species) {
      keys.add(normalizeString(taxonomy.species));
    }
    if (taxonomy.agronomicCategory) {
      keys.add(normalizeString(taxonomy.agronomicCategory));
    }
  }
  return Array.from(keys).filter((k) => k.length > 0);
}

/**
 * Checks if two strings match by partial inclusion
 */
function matchesByInclusion(source: string, target: string): boolean {
  if (!source || !target) {
    return false;
  }
  return source.includes(target) || target.includes(source);
}

/**
 * Collects all authorized crops from label (colture_target and dosaggi_dettagliati)
 */
function collectAuthorizedCrops(label: Label): string[] {
  const authorizedCrops: string[] = [];
  if (label.colture_target && Array.isArray(label.colture_target)) {
    authorizedCrops.push(...label.colture_target);
  }
  if (label.dosaggi_dettagliati && Array.isArray(label.dosaggi_dettagliati)) {
    for (const dose of label.dosaggi_dettagliati) {
      if (dose.coltura && !authorizedCrops.includes(dose.coltura)) {
        authorizedCrops.push(dose.coltura);
      }
    }
  }
  return authorizedCrops;
}

/**
 * Result of LLM-based crop authorization check
 */
export interface CropAuthorizationResult {
  readonly isAuthorized: boolean;
  readonly authorizedCrops: ReadonlyArray<string>;
  readonly matchedByLlm: boolean;
  readonly llmMatchedCrops?: ReadonlyArray<string>;
  readonly llmConfidence?: number;
  readonly llmReason?: string;
}

/**
 * Checks if the crop is authorized by the label using LLM semantic matching.
 * Handles synonyms, scientific names, common names, and regional variants natively.
 */
export async function checkCropAuthorizationWithLlmFallback(
  label: Label,
  productName: string,
  cropName?: string | null,
  variety?: string | null,
): Promise<CropAuthorizationResult> {
  const authorizedCrops = collectAuthorizedCrops(label);

  if (authorizedCrops.length === 0) {
    return { isAuthorized: true, authorizedCrops: [], matchedByLlm: false };
  }

  if (!cropName && !variety) {
    return { isAuthorized: false, authorizedCrops, matchedByLlm: false };
  }

  try {
    const taxonomy: CropTaxonomyContext | null = findCropTaxonomyContext(
      cropName ?? '',
      variety ?? '',
    );

    const llmResult = await llmMatchProductToCrop(
      productName,
      label,
      cropName ?? '',
      variety ?? undefined,
      taxonomy ?? undefined,
      undefined,
    );

    console.log(
      `[CONFORMITY-MATCHER] LLM result for "${productName}" vs "${cropName}": compatible=${llmResult.isCompatible}, confidence=${llmResult.confidence}%`,
    );

    if (llmResult.isCompatible && llmResult.confidence >= LLM_CONFIDENCE_THRESHOLD) {
      console.log(
        `[CONFORMITY-MATCHER] ✓ LLM approved crop "${cropName}" for product "${productName}" with confidence ${llmResult.confidence}%: ${llmResult.reason}`,
      );
      return {
        isAuthorized: true,
        authorizedCrops,
        matchedByLlm: true,
        llmMatchedCrops: llmResult.matchedCrops,
        llmConfidence: llmResult.confidence,
        llmReason: llmResult.reason,
      };
    }

    console.log(
      `[CONFORMITY-MATCHER] ✗ LLM rejected crop "${cropName}" for product "${productName}" (confidence ${llmResult.confidence}%): ${llmResult.reason}`,
    );

    return {
      isAuthorized: false,
      authorizedCrops,
      matchedByLlm: false,
      llmConfidence: llmResult.confidence,
      llmReason: llmResult.reason,
    };
  } catch (error) {
    console.error(
      `[CONFORMITY-MATCHER] LLM crop authorization error for "${cropName}":`,
      error instanceof Error ? error.message : String(error),
    );
    return {
      isAuthorized: false,
      authorizedCrops,
      matchedByLlm: false,
    };
  }
}

/**
 * Finds the most appropriate dose detail for a crop from label.
 * Returns null if the crop is not found in any dosaggi_dettagliati.
 * Uses taxonomy-based matching, with optional LLM-matched crop names as extra keys.
 */
export function findMatchingDoseDetail(
  label: Label,
  cropName?: string | null,
  variety?: string | null,
  llmMatchedCrops?: ReadonlyArray<string>,
): LabelDoseDetail | null {
  if (!label.dosaggi_dettagliati || label.dosaggi_dettagliati.length === 0) {
    return null;
  }

  const cropMatchKeys = [...buildCropMatchKeys(cropName, variety)];
  if (llmMatchedCrops) {
    for (const mc of llmMatchedCrops) {
      const normalized = normalizeString(mc);
      if (normalized) cropMatchKeys.push(normalized);
    }
  }
  if (cropMatchKeys.length === 0) {
    return null;
  }

  for (const dose of label.dosaggi_dettagliati) {
    const normalizedColtura = normalizeString(dose.coltura);
    if (!normalizedColtura) continue;

    for (const cropKey of cropMatchKeys) {
      const exactMatch = normalizedColtura === cropKey;
      const inclusionMatch = matchesByInclusion(normalizedColtura, cropKey);
      if (exactMatch || inclusionMatch) {
        return dose;
      }
    }
  }

  return null;
}

/**
 * Finds a label for a product, searching by registrationNumber first, then by productName
 * NOTE: Uses cleanRegNumber to normalize registration numbers (as dosage_agent does)
 */
export function findLabelForProduct(
  regNumber: string | undefined | null,
  productName: string | undefined | null,
  labelByRegNumber: Map<string, ProductWithLabel['label']>,
  labelByProductName: Map<string, ProductWithLabel['label']>,
): ProductWithLabel['label'] | null {
  if (regNumber) {
    const normalizedRegNumber = cleanRegNumber(regNumber);
    if (normalizedRegNumber && normalizedRegNumber !== '0') {
      const labelByNormalizedReg = labelByRegNumber.get(normalizedRegNumber);
      if (labelByNormalizedReg) {
        return labelByNormalizedReg;
      }
    }
    const labelByReg = labelByRegNumber.get(regNumber);
    if (labelByReg) {
      return labelByReg;
    }
  }

  if (productName) {
    const normalizedName = productName.toLowerCase().trim();
    const labelByName = labelByProductName.get(normalizedName);
    if (labelByName) {
      return labelByName;
    }
  }

  return null;
}

/**
 * Extracts a valid Label from a label extraction record
 */
export function extractLabelFromExtraction(
  labelExtraction: ProductWithLabel['label'] | null,
): Label | null {
  if (!labelExtraction) {
    return null;
  }
  if (isFitoLabel(labelExtraction.label)) {
    return labelExtraction.label as Label;
  }
  return null;
}

/**
 * Result of resolving a label for a product
 */
export interface ResolvedLabel {
  readonly labelExtraction: ProductWithLabel['label'] | null;
  readonly label: Label | null;
  readonly effectiveRegNumber: string;
}

/**
 * Resolves label for a product from cached maps.
 * Combines findLabelForProduct + extractLabelFromExtraction + effectiveRegNumber derivation.
 */
export function resolveLabel(
  regNumber: string,
  productName: string,
  labelByRegNumber: LabelMap,
  labelByProductName: LabelMap,
): ResolvedLabel {
  const labelExtraction = findLabelForProduct(
    regNumber,
    productName,
    labelByRegNumber,
    labelByProductName,
  );
  const label = extractLabelFromExtraction(labelExtraction);
  const effectiveRegNumber = regNumber || (labelExtraction?.registrationNumber ?? '');
  return { labelExtraction, label, effectiveRegNumber };
}
