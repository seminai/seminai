/** One aggregated shipping row (per shipping date + carrier). */
export interface ShippingSummaryRow {
  readonly date: string; // ISO YYYY-MM-DD
  readonly carrier: string | null;
  readonly recipients: readonly string[];
  readonly ddtCount: number;
  readonly packagesCount: number;
  readonly estimatedWeightKg: number;
  readonly ddtIds: readonly string[];
}

export interface ShippingSummaryTotals {
  readonly ddtCount: number;
  readonly packagesCount: number;
  readonly estimatedWeightKg: number;
}

/** Aggregated summary of the pending (GENERATED) DDTs ready for the courier. */
export interface ShippingSummaryDto {
  readonly rows: readonly ShippingSummaryRow[];
  readonly totals: ShippingSummaryTotals;
}
