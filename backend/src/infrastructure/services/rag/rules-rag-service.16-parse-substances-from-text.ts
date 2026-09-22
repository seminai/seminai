import type { RulesRagServiceContext } from './rules-rag-service.context';

export function rulesRagServiceParseSubstancesFromText(this: RulesRagServiceContext, str: string): string[] {
    return str
      .split(/[,\/]|\s+e\s+|\s+o\s+/i)
      .map((s) => this.normalizeActiveIngredient(s))
      .filter((s) => s.length > 2 && !s.match(/^\d+$/));
  }
