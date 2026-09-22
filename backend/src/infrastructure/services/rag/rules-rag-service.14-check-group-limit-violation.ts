import { RuleCategory } from '@prisma/client';
import { RuleComplianceResult, RuleViolationDetail } from '../../../domain/dtos/rule-rag.types';
import type { RulesRagServiceContext } from './rules-rag-service.context';

export function rulesRagServiceCheckGroupLimitViolation(this: RulesRagServiceContext, text: string, activeIngredient: string, maxApplications: number | undefined, result: RuleComplianceResult, ruleCategory: RuleCategory): RuleViolationDetail | null {
    if (!maxApplications || maxApplications <= 0) return null;

    const groupLimits = this.extractGroupLimitsFromText(text);
    const normalizedIngredient = this.normalizeActiveIngredient(activeIngredient);

    for (const limit of groupLimits) {
      if (this.ingredientBelongsToGroup(normalizedIngredient, limit.substances)) {
        if (maxApplications > limit.maxInterventions) {
          return {
            ruleId: result.ruleId,
            ruleName: result.ruleName,
            ruleCategory,
            violationType: 'MAX_APPLICATIONS_EXCEEDED',
            severity: 'CRITICAL',
            description:
              `Numero interventi ${maxApplications} supera il limite di ${limit.maxInterventions} ` +
              `per il gruppo sostanze attive (${limit.substances.join(', ')}) ` +
              `secondo la regola ${result.ruleName}`,
            suggestedAction: `Ridurre a max ${limit.maxInterventions} interventi/anno per questo gruppo SA`,
            sourceChunk: result.relevantChunks[0]?.content?.substring(0, 300),
          };
        }
      }
    }
    return null;
  }
