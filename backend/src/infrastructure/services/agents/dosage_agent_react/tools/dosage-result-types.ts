/**
 * Shared type definitions for dosage result structures used across
 * generate-plan, calculate-dosage, and create-jobs tools.
 */

export interface DosageResultProductTreatment {
  readonly avversita?: string;
  readonly dose?: number;
  readonly dose_ha?: number;
  readonly dosaggio_um?: string;
  readonly doseUnit?: string;
  readonly quantita_totale?: number;
  readonly totalQuantity?: number;
  readonly data_distribuzione?: string;
  readonly date?: string;
  readonly modalita_impiego?: string;
  readonly mode?: string;
  readonly epoca_impiego?: string;
  readonly ddt_date_is_ok?: boolean;
}

export interface DosageResultProduct {
  readonly productName?: string;
  readonly name?: string;
  readonly productId?: string;
  readonly registrationNumber?: string;
  readonly regNumber?: string;
  readonly activeIngredient?: string;
  readonly principioAttivo?: string;
  readonly adversity?: string;
  readonly carenza?: number;
  readonly safetyInterval?: number;
  readonly noTreatmentReason?: string | null;
  readonly trattamenti?: DosageResultProductTreatment[];
}

export interface DosageResultExcludedProduct {
  readonly productName?: string;
  readonly name?: string;
  readonly registrationNumber?: string;
  readonly regNumber?: string;
  readonly exclusionReason?: string;
  readonly reason?: string;
  readonly category?: string;
}

export interface DosageResultUnit {
  readonly unitProductionId?: string;
  readonly productionUnitId?: string;
  readonly productionUnitName?: string;
  readonly unitName?: string;
  readonly cropName?: string;
  readonly areaHa?: number;
  readonly region?: string;
  readonly products?: DosageResultProduct[];
  readonly excludedProducts?: DosageResultExcludedProduct[];
}

export interface ComplianceViolationLike {
  readonly productName?: string;
  readonly registrationNumber?: string;
  readonly severity?: string;
  readonly type?: string;
  readonly ruleType?: string;
  readonly message?: string;
  readonly description?: string;
  readonly source?: string;
  readonly disciplinareSource?: string;
}

export interface StockItemLike {
  readonly productName?: string;
  readonly name?: string;
  readonly totalUsed?: number;
  readonly required?: number;
  readonly available?: number;
  readonly stock?: number;
  readonly unit?: string;
  readonly unitOfMeasure?: string;
}

export interface StockBalanceLike {
  readonly products?: StockItemLike[];
  readonly items?: StockItemLike[];
}
