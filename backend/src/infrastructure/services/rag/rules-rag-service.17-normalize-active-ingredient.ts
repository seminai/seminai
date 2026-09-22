import type { RulesRagServiceContext } from './rules-rag-service.context';

export function rulesRagServiceNormalizeActiveIngredient(this: RulesRagServiceContext, value: string): string {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }
