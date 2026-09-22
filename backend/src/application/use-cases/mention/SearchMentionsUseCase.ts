import { AppError } from '../../../domain/errors/AppError';
import type { MentionEntityType, MentionSearchResult } from '../../../domain/dtos/mention.dto';
import { isMentionEntityType } from '../../../domain/dtos/mention.dto';
import type { IMentionSearchRepository } from '../../../domain/repositories/IMentionSearchRepository';

interface SearchMentionsInput {
  readonly userId: string;
  readonly query: string;
  readonly types?: readonly string[];
  readonly limit?: number;
}

/**
 * Searches mentionable entities across all supported types.
 * Validates input and delegates to the mention search repository.
 */
export class SearchMentionsUseCase {
  constructor(private readonly mentionSearchRepository: IMentionSearchRepository) {}

  async execute(input: SearchMentionsInput): Promise<MentionSearchResult> {
    const { userId, query, types, limit } = input;

    if (!query || query.trim().length === 0) {
      throw AppError.badRequest('Search query must be a non-empty string', 'INVALID_QUERY');
    }

    let validatedTypes: MentionEntityType[] | undefined;
    if (types && types.length > 0) {
      validatedTypes = [];
      for (const type of types) {
        if (!isMentionEntityType(type)) {
          throw AppError.badRequest(`Invalid mention type: "${type}"`, 'INVALID_MENTION_TYPE');
        }
        validatedTypes.push(type);
      }
    }

    const items = await this.mentionSearchRepository.search({
      userId,
      query: query.trim(),
      types: validatedTypes,
      limit,
    });

    return { items };
  }
}
