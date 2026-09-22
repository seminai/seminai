import { UnitAllowedProductsOutput } from './flowMatchCropTreatment';
import type { ExcludedProduct } from './types';
import { type BaseQuantityUnit } from './unitConversion';
import { Label, isFitoLabel } from '../../../../domain/dtos/label.dto';
import { findDosageDetails, type ProductionUnitCycle } from './treatmentDatePlanner';

// OPTIMIZATION: Limit concurrent LLM calls to avoid rate limiting
export const LLM_CONCURRENCY_LIMIT = 10;

export interface TreatmentApplication {
  readonly data_distribuzione?: Date;
  readonly dose?: number;
  readonly epoca_impiego?: string;
  readonly isLocalizedTreatment?: boolean;
  readonly note?: string;
  readonly dosaggio_um?: string;
  readonly application?: string | null;
  readonly fasce_rispetto_acqua?: string | null;
  readonly fasce_rispetto_colture?: string | null;
  readonly ddt_date_is_ok?: boolean | null;
  readonly ddt_date_conformity?: string | null;
  readonly ddt_date_after_treatment?: boolean | null;
}

export type AllowedProductBase = UnitAllowedProductsOutput['products'][number];

export type UnitAllowedProductWithDosage = AllowedProductBase & {
  readonly trattamenti?: ReadonlyArray<TreatmentApplication>;
  readonly noTreatmentReason?: string;
};

export type UnitAllowedProductsWithDosageOutput = Omit<UnitAllowedProductsOutput, 'products'> & {
  readonly products: ReadonlyArray<UnitAllowedProductWithDosage>;
  /** Prodotti esclusi dalla selezione con motivazioni */
  readonly excludedProducts?: ReadonlyArray<ExcludedProduct>;
};

export interface ProductStockBalance {
  readonly productName: string;
  readonly regNumber: string;
  readonly quantityAvailable: number;
  readonly quantityUom: BaseQuantityUnit;
  readonly totalUsed: number;
  readonly balance: number;
  readonly isOverused: boolean;
  readonly percentageUsed: number;
  /** Giacenza da raggiungere specificata dall'utente (stessa UoM di quantityUom) */
  readonly targetStock?: number;
  /** Bilancio rispetto alla giacenza target: quantityAvailable - totalUsed - targetStock */
  readonly balanceVsTarget?: number;
  readonly unitBreakdown: ReadonlyArray<{
    readonly unitProductionId: string;
    readonly cropName?: string;
    readonly variety?: string;
    readonly areaHa?: number;
    readonly totalDoseForUnit: number;
    readonly applications: number;
  }>;
}

export interface StockBalanceReport {
  readonly timestamp: Date;
  readonly totalProducts: number;
  readonly productsOverused: number;
  readonly productsWithinLimit: number;
  readonly products: ReadonlyArray<ProductStockBalance>;
}

export function extractLabel(product: AllowedProductBase): Label | null {
  const label = (product as { label?: unknown }).label;
  return label && isFitoLabel(label) ? label : null;
}

/**
 * Parse date string and fix potential DD-MM swap from LLM.
 * The LLM sometimes returns dates in YYYY-DD-MM instead of YYYY-MM-DD.
 *
 * Strategy:
 * 1. If day > 12, it's definitely in correct format (day can't be month)
 * 2. If day <= 12 and month > 12, the LLM swapped them - fix it
 * 3. If both <= 12, check if the date falls within the crop cycle
 *    - If original is outside cycle but swapped is inside, use swapped
 */
export function parseAndFixDate(dateStr: string, cycleStart: Date, cycleEnd: Date): Date {
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return parsed;

  // Extract components from ISO string YYYY-MM-DD
  const parts = dateStr.split('-');
  if (parts.length !== 3) return parsed;

  const year = Number(parts[0]);
  const firstNum = Number(parts[1]); // Could be month or day
  const secondNum = Number(parts[2]); // Could be day or month

  // Case 1: If second number > 12, format is correct (YYYY-MM-DD)
  if (secondNum > 12) {
    return parsed;
  }

  // Case 2: If first number > 12, LLM swapped them (YYYY-DD-MM)
  if (firstNum > 12) {
    const corrected = new Date(Date.UTC(year, secondNum - 1, firstNum));
    console.log(
      `[DATE-FIX] Swapped date: ${dateStr} -> ${corrected.toISOString().split('T')[0]} (day ${firstNum} > 12)`,
    );
    return corrected;
  }

  // Case 3: Both <= 12, ambiguous - check which makes sense for crop cycle
  // Extend cycle range by 2 months on each side for flexibility
  const extendedStart = new Date(cycleStart);
  extendedStart.setMonth(extendedStart.getMonth() - 2);
  const extendedEnd = new Date(cycleEnd);
  extendedEnd.setMonth(extendedEnd.getMonth() + 2);

  const originalDate = parsed;
  const swappedDate = new Date(Date.UTC(year, secondNum - 1, firstNum));

  const originalInRange = originalDate >= extendedStart && originalDate <= extendedEnd;
  const swappedInRange = swappedDate >= extendedStart && swappedDate <= extendedEnd;

  // If original is out of range but swapped is in range, use swapped
  if (!originalInRange && swappedInRange) {
    console.log(
      `[DATE-FIX] Swapped date: ${dateStr} -> ${swappedDate.toISOString().split('T')[0]} (outside cycle: ${cycleStart.toISOString().split('T')[0]} - ${cycleEnd.toISOString().split('T')[0]})`,
    );
    return swappedDate;
  }

  return originalDate;
}

export function buildUnitCycle(unit: UnitAllowedProductsOutput): ProductionUnitCycle | null {
  const u = unit as {
    cropName?: string;
    variety?: string;
    location?: string;
    address?: string;
    startDate?: Date | string;
    floweringDate?: Date | string;
    harvestingDate?: Date | string;
    endDate?: Date | string;
  };
  if (!u.cropName) return null;

  const toDate = (v: Date | string | undefined): Date | undefined =>
    v instanceof Date ? v : typeof v === 'string' ? new Date(v) : undefined;

  return {
    cropName: u.cropName,
    variety: u.variety,
    location: u.location || u.address,
    startDate: toDate(u.startDate),
    floweringDate: toDate(u.floweringDate),
    harvestingDate: toDate(u.harvestingDate),
    endDate: toDate(u.endDate),
  };
}

export async function getDosageUm(label: Label, cropName: string): Promise<string> {
  const details = await findDosageDetails(label, cropName, undefined, true);
  const detail = details[0];
  if (detail?.dose_um) return detail.dose_um;
  const form = (label.formulazione || label.categoria || '').toLowerCase();
  return form.includes('sc') || form.includes('ec') || form.includes('sl') ? 'L/ha' : 'kg/ha';
}
