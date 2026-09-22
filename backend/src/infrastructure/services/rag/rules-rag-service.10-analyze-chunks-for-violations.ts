import { RuleComplianceResult, RuleViolationDetail } from '../../../domain/dtos/rule-rag.types';
import { ValidateProductParams } from './rules-rag-service.support';
import type { RulesRagServiceContext } from './rules-rag-service.context';

export function rulesRagServiceAnalyzeChunksForViolations(this: RulesRagServiceContext, result: RuleComplianceResult, queryType: string, params: ValidateProductParams): RuleViolationDetail[] {
    const violations: RuleViolationDetail[] = [];
    const ruleCategory = this.mapToViolationCategory(result.category);
    if (!ruleCategory) return violations;
    const combinedText = result.relevantChunks.map((c) => c.content.toLowerCase()).join(' ');
    if (queryType === 'dosage') {
      const doseViolation = this.checkDoseViolation(
        combinedText,
        params.dose,
        params.doseUnit,
        result,
        ruleCategory,
      );
      if (doseViolation) violations.push(doseViolation);
    }
    if (queryType === 'timing') {
      const timingViolation = this.checkTimingViolation(
        combinedText,
        params.applicationDate,
        result,
        ruleCategory,
      );
      if (timingViolation) violations.push(timingViolation);
    }
    if (queryType === 'authorization') {
      const authViolation = this.checkAuthorizationViolation(
        combinedText,
        params.activeIngredient,
        result,
        ruleCategory,
      );
      if (authViolation) violations.push(authViolation);
    }
    // Handle group limit validation for disciplinari
    if (
      queryType === 'group_limit' ||
      queryType === 'substance_limit' ||
      queryType === 'max_applications' ||
      queryType === 'interactions'
    ) {
      const groupViolation = this.checkGroupLimitViolation(
        combinedText,
        params.activeIngredient,
        params.maxApplications,
        result,
        ruleCategory,
      );
      if (groupViolation) violations.push(groupViolation);
    }
    return violations;
  }
