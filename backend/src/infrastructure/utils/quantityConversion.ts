/**
 * Converts quantity and unit of measure to canonical units (kg for weight, L for volume).
 * Used by DDT and Invoice extractors to expose quantityConverted and unitMeasureConverted.
 */

export interface QuantityConversionResult {
  readonly quantityConverted: number;
  readonly unitMeasureConverted: string;
}

/** Weight units that convert to kg. Factor = multiplier to obtain kg. */
const WEIGHT_TO_KG: ReadonlyArray<{
  readonly aliases: readonly string[];
  readonly factor: number;
}> = [
  { aliases: ['kg'], factor: 1 },
  { aliases: ['t', 'tn', 'ton', 'tonnellate', 'tm'], factor: 1000 },
  { aliases: ['q', 'quintali', 'q.le', 'ql', 'qle'], factor: 100 },
  { aliases: ['g', 'gr'], factor: 0.001 },
];

/** Volume units that convert to L. Factor = multiplier to obtain L. */
const VOLUME_TO_L: ReadonlyArray<{ readonly aliases: readonly string[]; readonly factor: number }> =
  [
    { aliases: ['l', 'lt', 'litri'], factor: 1 },
    { aliases: ['ml'], factor: 0.001 },
  ];

function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase().replace(/\./g, '');
}

function findWeightFactor(normalized: string): number | null {
  for (const { aliases, factor } of WEIGHT_TO_KG) {
    if (aliases.includes(normalized)) return factor;
  }
  return null;
}

function findVolumeFactor(normalized: string): number | null {
  for (const { aliases, factor } of VOLUME_TO_L) {
    if (aliases.includes(normalized)) return factor;
  }
  return null;
}

/**
 * Converts a quantity to canonical unit (kg for weight, L for volume).
 * If quantity or unitOfMeasure is null/empty, returns null.
 * If unit is not recognized, returns same quantity and original unit (no conversion).
 *
 * @param quantity - Raw quantity from document
 * @param unitOfMeasure - Unit string (e.g. kg, tn, quintali, L, ml)
 * @returns Conversion result or null when inputs are missing
 */
export function convertQuantityToCanonicalUnit(
  quantity: number | null,
  unitOfMeasure: string | null,
): QuantityConversionResult | null {
  if (quantity === null || quantity === undefined) return null;
  if (!unitOfMeasure || typeof unitOfMeasure !== 'string') return null;
  const normalized = normalizeUnit(unitOfMeasure);
  if (!normalized) return null;

  const weightFactor = findWeightFactor(normalized);
  if (weightFactor !== null) {
    return {
      quantityConverted: quantity * weightFactor,
      unitMeasureConverted: 'kg',
    };
  }

  const volumeFactor = findVolumeFactor(normalized);
  if (volumeFactor !== null) {
    return {
      quantityConverted: quantity * volumeFactor,
      unitMeasureConverted: 'L',
    };
  }

  return {
    quantityConverted: quantity,
    unitMeasureConverted: unitOfMeasure.trim(),
  };
}
