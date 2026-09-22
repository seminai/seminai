import { RuleCategory } from '@prisma/client';
import { RuleComplianceResult, RuleViolationDetail } from '../../../domain/dtos/rule-rag.types';
import type { RulesRagServiceContext } from './rules-rag-service.context';

export function rulesRagServiceCheckAuthorizationViolation(this: RulesRagServiceContext, text: string, activeIngredient: string, result: RuleComplianceResult, ruleCategory: RuleCategory): RuleViolationDetail | null {
    const ingredientLower = activeIngredient.toLowerCase();
    const forbiddenPatterns = [
      `${ingredientLower}.*(?:vietato|non consentito|non autorizzato|revocato|sospeso)`,
      `(?:vietato|non consentito|non autorizzato|revocato|sospeso).*${ingredientLower}`,
    ];
    for (const pattern of forbiddenPatterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(text)) {
          return {
            ruleId: result.ruleId,
            ruleName: result.ruleName,
            ruleCategory,
            violationType: 'FORBIDDEN_ACTIVE_INGREDIENT',
            severity: 'CRITICAL',
            description: `Active ingredient "${activeIngredient}" may be forbidden according to rule ${result.ruleName}`,
            suggestedAction: 'Use an alternative active ingredient allowed by the rule',
            sourceChunk: result.relevantChunks[0]?.content?.substring(0, 200),
          };
        }
      } catch {
        continue;
      }
    }
    return null;
  }
