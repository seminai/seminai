import type { MentionItem } from '../../domain/dtos/mention.dto';

export interface CompanyOption {
  readonly id: string;
  readonly name: string;
}

export interface ResolveCompanyInput {
  readonly mentions: readonly MentionItem[];
  readonly userCompanies: readonly CompanyOption[];
}

export type CompanyResolution =
  | { readonly kind: 'mention'; readonly companyId: string }
  | { readonly kind: 'auto'; readonly companyId: string }
  | { readonly kind: 'needsQuestion'; readonly options: readonly CompanyOption[] }
  | { readonly kind: 'noCompanies' };

/**
 * Resolves which company to associate with a chat-uploaded document, deterministically.
 *
 * Priority:
 *  1. mention: the user explicitly mentioned exactly one @company in the message → use it
 *     (only if that company is in the user's accessible list)
 *  2. auto: the user has exactly one company → use it
 *  3. needsQuestion: more than one company and no mention → ask the user via ask_user_questions
 *  4. noCompanies: the user has no companies yet → caller must guide creation
 *
 * Multiple distinct @company mentions are NOT auto-resolved here: it's ambiguous which
 * one to use, so we fall through to needsQuestion with the mentioned ones as options.
 */
export function resolveCompanyForExtraction(input: ResolveCompanyInput): CompanyResolution {
  const { mentions, userCompanies } = input;

  if (userCompanies.length === 0) {
    return { kind: 'noCompanies' };
  }

  const accessibleIds = new Set(userCompanies.map((c) => c.id));
  const mentionedAccessible = mentions
    .filter((m) => m.type === 'company' && accessibleIds.has(m.id))
    .map((m) => m.id);
  const uniqueMentioned = Array.from(new Set(mentionedAccessible));

  if (uniqueMentioned.length === 1) {
    return { kind: 'mention', companyId: uniqueMentioned[0] };
  }

  if (uniqueMentioned.length > 1) {
    const options = userCompanies.filter((c) => uniqueMentioned.includes(c.id));
    return { kind: 'needsQuestion', options };
  }

  if (userCompanies.length === 1) {
    return { kind: 'auto', companyId: userCompanies[0].id };
  }

  return { kind: 'needsQuestion', options: userCompanies };
}
