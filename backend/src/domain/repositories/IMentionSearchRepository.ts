import type { MentionEntityType, MentionSearchResultItem } from '../dtos/mention.dto';

/**
 * Parameters for searching mentionable entities.
 */
export interface MentionSearchParams {
  readonly userId: string;
  readonly query: string;
  readonly types?: readonly MentionEntityType[];
  readonly limit?: number;
}

/**
 * Repository interface for unified mention search across entity types.
 */
export interface IMentionSearchRepository {
  search(params: MentionSearchParams): Promise<MentionSearchResultItem[]>;
}
