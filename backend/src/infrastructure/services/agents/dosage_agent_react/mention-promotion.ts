import type { MentionItem } from '../../../../domain/dtos/mention.dto';

/**
 * Selects the single-company-mention UUID for promotion into working memory.
 * Returns the company id only when exactly one company-type mention is present.
 * Ambiguous (0 or 2+) → undefined, so the LLM must disambiguate explicitly.
 */
export function selectPromotedCompanyId(
  mentions: readonly MentionItem[] | undefined,
): string | undefined {
  if (!mentions || mentions.length === 0) return undefined;
  const companyMentions = mentions.filter((m) => m.type === 'company');
  return companyMentions.length === 1 ? companyMentions[0].id : undefined;
}
