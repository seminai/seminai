export type MentionEntityType =
  | 'company'
  | 'product'
  | 'field'
  | 'production_unit'
  | 'stock'
  | 'file';

/**
 * A mention reference tracked in chat input state and sent to the backend.
 */
export interface MentionItem {
  readonly type: MentionEntityType;
  readonly id: string;
  readonly label: string;
}

/**
 * A single result from the unified mention search endpoint.
 */
export interface MentionSearchResultItem {
  readonly id: string;
  readonly type: MentionEntityType;
  readonly label: string;
  readonly subtitle?: string;
}

/**
 * API response shape for GET /mentions/search.
 */
export interface MentionSearchResponse {
  readonly status: string;
  readonly data: readonly MentionSearchResultItem[];
}

/** Human-readable labels for entity types (Italian). */
export const MENTION_TYPE_LABELS: Record<MentionEntityType, string> = {
  company: 'Aziende',
  product: 'Prodotti',
  field: 'Campi',
  production_unit: 'Unità Produttive',
  stock: 'Stock',
  file: 'Documenti',
} as const;
