/**
 * Canonical unit-of-measure whitelist shared between the extraction pipeline
 * (LLM post-validation) and the API contract surfaced to the FE.
 *
 * The FE mirrors this list to power the UDM dropdown in the invoice review
 * table. Keep the FE copy ([seminai-fe-v3/src/types/extraction.ts]) in sync
 * whenever this array changes.
 */
export const CANONICAL_UNITS = [
  'KG',
  'G',
  'T',
  'Q',
  'L',
  'LT',
  'ML',
  'NR',
  'PZ',
  'CF',
  'SC',
  'CT',
  'CN',
] as const;

export type CanonicalUnit = (typeof CANONICAL_UNITS)[number];
