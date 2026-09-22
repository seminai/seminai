/**
 * Mention entity types supported by the @mention system.
 */
export type MentionEntityType =
  | 'company'
  | 'product'
  | 'field'
  | 'production_unit'
  | 'stock'
  | 'file';

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
 * Aggregated response from the mention search endpoint.
 */
export interface MentionSearchResult {
  readonly items: readonly MentionSearchResultItem[];
}

/**
 * A mention reference sent by the FE when sending a message.
 * Contains the minimal data needed to resolve full entity context.
 */
export interface MentionItem {
  readonly type: MentionEntityType;
  readonly id: string;
  readonly label: string;
}

/**
 * All valid mention entity types, used for runtime validation.
 */
export const MENTION_ENTITY_TYPES: readonly MentionEntityType[] = [
  'company',
  'product',
  'field',
  'production_unit',
  'stock',
  'file',
] as const;

/**
 * Type guard to check if a string is a valid MentionEntityType.
 */
export function isMentionEntityType(value: string): value is MentionEntityType {
  return MENTION_ENTITY_TYPES.includes(value as MentionEntityType);
}
