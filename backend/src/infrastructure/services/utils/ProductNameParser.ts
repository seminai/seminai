import { ProductRegistrationLookupService } from './ProductRegistrationLookup';

/** Parsed result from a raw product name. */
export interface ParsedProductName {
  readonly baseName: string;
  readonly packagingInfo: string | null;
  readonly packagingQuantity: number | null;
  readonly packagingUnit: string | null;
  readonly rawName: string;
}

/** Result of converting a "pz" (pieces) quantity to a real unit. */
export interface PiecesConversionResult {
  readonly quantity: number;
  readonly unitOfMeasure: string;
  readonly packagingInfo: string;
  readonly converted: boolean;
}

const PACKAGING_REGEX = /\bda\s+(kg|gr|g|lt|l|ml)\.?\s*([0-9]+(?:[.,][0-9]+)?)\b/gi;
const UNIT_DOT_NUMBER_REGEX = /\b(kg|gr|g|lt|l|ml)\.([0-9]+(?:[.,][0-9]+)?)/gi;
const INLINE_NUMBER_UNIT_REGEX = /\b([0-9]+(?:[.,][0-9]+)?)(kg|gr|lt|ml)\b/i;
const EMBEDDED_QTY_REGEX = /\b([0-9]+(?:[.,][0-9]+)?)\s*(kg|gr|g|lt|l|ml)\.?\s*$/i;
const LEADING_CODE_REGEX = /^[A-Z0-9]{2,}\s*-\s*/i;
const TRAILING_CODES_REGEX = /\s+(?:DI|N|COD|ART|REF)[A-Z0-9]*\d[A-Z0-9]*$/i;
const QUANTITY_SUFFIX_REGEX = /\bda\s+(?:\d+(?:[.,]\d+)?)\s*$/gi;
const CLP_SUFFIX_REGEX = /\s*-\s*clp\s*-?\s*$/i;

const UNIT_NORMALIZATION: Record<string, string> = {
  kg: 'KG',
  gr: 'GR',
  g: 'GR',
  lt: 'LT',
  l: 'LT',
  ml: 'ML',
};

const PZ_VARIANTS = new Set([
  'pz',
  'pz.',
  'pezzi',
  'conf',
  'conf.',
  'nr',
  'nr.',
  'n.',
  'lotti',
  'um',
  'units',
  'unità',
]);

/**
 * Parses a raw product name to extract the base product name and packaging information.
 */
export const parseProductName = (rawName: string): ParsedProductName => {
  if (!rawName || rawName.trim() === '') {
    return {
      baseName: '',
      packagingInfo: null,
      packagingQuantity: null,
      packagingUnit: null,
      rawName,
    };
  }

  let cleaned = rawName.trim();
  cleaned = cleaned.replace(LEADING_CODE_REGEX, '').trim();

  let packagingQuantity: number | null = null;
  let packagingUnit: string | null = null;
  let packagingInfo: string | null = null;

  const match = PACKAGING_REGEX.exec(cleaned);
  PACKAGING_REGEX.lastIndex = 0;

  let usedEmbeddedQty = false;
  let usedInlineQty = false;

  if (match) {
    const rawUnit = match[1].toLowerCase();
    const rawQty = match[2].replace(',', '.');
    packagingUnit = UNIT_NORMALIZATION[rawUnit] ?? rawUnit.toUpperCase();
    packagingQuantity = parseFloat(rawQty);
    packagingInfo = `${packagingQuantity} ${packagingUnit}`;
  } else {
    const unitDotMatch = UNIT_DOT_NUMBER_REGEX.exec(cleaned);
    UNIT_DOT_NUMBER_REGEX.lastIndex = 0;
    if (unitDotMatch) {
      const rawUnit = unitDotMatch[1].toLowerCase();
      const rawQty = unitDotMatch[2].replace(',', '.');
      packagingUnit = UNIT_NORMALIZATION[rawUnit] ?? rawUnit.toUpperCase();
      packagingQuantity = parseFloat(rawQty);
      packagingInfo = `${packagingQuantity} ${packagingUnit}`;
    } else {
      const inlineMatch = INLINE_NUMBER_UNIT_REGEX.exec(cleaned);
      if (inlineMatch) {
        const rawQty = inlineMatch[1].replace(',', '.');
        const rawUnit = inlineMatch[2].toLowerCase();
        packagingUnit = UNIT_NORMALIZATION[rawUnit] ?? rawUnit.toUpperCase();
        packagingQuantity = parseFloat(rawQty);
        packagingInfo = `${packagingQuantity} ${packagingUnit}`;
        usedInlineQty = true;
      } else {
        const embeddedMatch = EMBEDDED_QTY_REGEX.exec(cleaned);
        if (embeddedMatch) {
          const rawQty = embeddedMatch[1].replace(',', '.');
          const rawUnit = embeddedMatch[2].toLowerCase();
          packagingUnit = UNIT_NORMALIZATION[rawUnit] ?? rawUnit.toUpperCase();
          packagingQuantity = parseFloat(rawQty);
          packagingInfo = `${packagingQuantity} ${packagingUnit}`;
          usedEmbeddedQty = true;
        }
      }
    }
  }

  let baseName = cleaned
    .replace(PACKAGING_REGEX, '')
    .replace(UNIT_DOT_NUMBER_REGEX, '')
    .replace(TRAILING_CODES_REGEX, '')
    .replace(QUANTITY_SUFFIX_REGEX, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  PACKAGING_REGEX.lastIndex = 0;
  UNIT_DOT_NUMBER_REGEX.lastIndex = 0;

  if (usedEmbeddedQty) {
    baseName = baseName.replace(EMBEDDED_QTY_REGEX, '').trim();
  }
  if (usedInlineQty) {
    baseName = baseName
      .replace(/\b([0-9]+(?:[.,][0-9]+)?)(kg|gr|lt|ml)\.?/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  baseName = baseName.replace(CLP_SUFFIX_REGEX, '').trim();

  while (baseName.length > 0 && (baseName.endsWith('-') || baseName.endsWith('.'))) {
    baseName = baseName.slice(0, -1).trim();
  }

  baseName = baseName.replace(/\s{2,}/g, ' ').trim();

  return {
    baseName: baseName || rawName.trim(),
    packagingInfo,
    packagingQuantity,
    packagingUnit,
    rawName,
  };
};

/**
 * Checks if a unit of measure represents pieces.
 */
export const isPiecesUnit = (unit: string): boolean => {
  return PZ_VARIANTS.has(unit.trim().toLowerCase());
};

/**
 * Converts a "pz" (pieces) quantity to a real unit using packaging info from the product name.
 *
 * Example: quantity=8, unit="pz", productName="REFINE SX da gr.10"
 * → { quantity: 80, unitOfMeasure: "GR", packagingInfo: "8 pz da 10 GR", converted: true }
 */
export const convertPiecesToRealUnit = (
  quantity: number,
  unitOfMeasure: string,
  productName: string,
): PiecesConversionResult => {
  if (!isPiecesUnit(unitOfMeasure)) {
    return { quantity, unitOfMeasure, packagingInfo: '', converted: false };
  }

  const parsed = parseProductName(productName);
  if (parsed.packagingQuantity === null || parsed.packagingUnit === null) {
    return { quantity, unitOfMeasure, packagingInfo: '', converted: false };
  }

  const totalQuantity = quantity * parsed.packagingQuantity;
  const info = `${quantity} pz da ${parsed.packagingQuantity} ${parsed.packagingUnit}`;

  return {
    quantity: totalQuantity,
    unitOfMeasure: parsed.packagingUnit,
    packagingInfo: info,
    converted: true,
  };
};

/**
 * Resolves a base product name to its official fitosanitario denomination.
 * Returns the official name if found with sufficient confidence, otherwise the original baseName.
 */
export const resolveOfficialName = (baseName: string): string => {
  if (!baseName) return baseName;

  const lookupService = new ProductRegistrationLookupService();
  const result = lookupService.findProduct(baseName);

  if (result) {
    return lookupService.getProductDenomination(result.registrationNumber) ?? baseName;
  }

  return baseName;
};
