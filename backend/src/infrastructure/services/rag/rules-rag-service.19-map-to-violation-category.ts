import { RuleCategory } from '@prisma/client';
import { VECTORIZABLE_RULE_CATEGORIES } from '../../../domain/dtos/rule-rag.types';
import type { RulesRagServiceContext } from './rules-rag-service.context';

export function rulesRagServiceMapToViolationCategory(this: RulesRagServiceContext, category: RuleCategory): RuleCategory | null {
    if (VECTORIZABLE_RULE_CATEGORIES.includes(category)) return category;
    return null;
  }
