export interface Pricing {
  readonly inputPerTokenUsd: number;
  readonly outputPerTokenUsd: number;
  /**
   * Fraction of input rate charged for cached prompt tokens (0–1).
   */
  readonly cachedInputDiscount: number;
}
