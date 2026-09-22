import type { RulesRagServiceContext } from './rules-rag-service.context';

export function rulesRagServiceIngredientBelongsToGroup(this: RulesRagServiceContext, ingredient: string, substances: string[]): boolean {
    if (substances.length === 0) return true; // Generic limit applies to all
    return substances.some((s) => ingredient.includes(s) || s.includes(ingredient));
  }
