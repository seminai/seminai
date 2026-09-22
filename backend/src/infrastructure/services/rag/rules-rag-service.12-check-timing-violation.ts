import { RuleCategory } from '@prisma/client';
import { RuleComplianceResult, RuleViolationDetail } from '../../../domain/dtos/rule-rag.types';
import type { RulesRagServiceContext } from './rules-rag-service.context';

export function rulesRagServiceCheckTimingViolation(this: RulesRagServiceContext, text: string, applicationDate: Date, result: RuleComplianceResult, ruleCategory: RuleCategory): RuleViolationDetail | null {
    const forbiddenKeywords = ['vietato', 'non consentito', 'non autorizzato', 'divieto'];
    const month = applicationDate.toLocaleDateString('it-IT', { month: 'long' }).toLowerCase();
    const hasForbidden = forbiddenKeywords.some((kw) => text.includes(kw));
    const mentionsMonth = text.includes(month);
    if (hasForbidden && mentionsMonth) {
      return {
        ruleId: result.ruleId,
        ruleName: result.ruleName,
        ruleCategory,
        violationType: 'WRONG_TIMING',
        severity: 'CRITICAL',
        description: `Application in ${month} may not be allowed according to rule ${result.ruleName}`,
        suggestedAction: 'Verify application timing against the rule document',
        sourceChunk: result.relevantChunks[0]?.content?.substring(0, 200),
      };
    }
    return null;
  }
