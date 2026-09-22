import type { Rule } from '../../../domain/entities/Rule';

export interface RuleApplicabilityDiagnostics {
  readonly appliesToDosage: boolean;
  readonly appliesToCompliance: boolean;
  readonly warnings: readonly string[];
  readonly notApplicableReason: string | null;
}

export function getRuleApplicabilityDiagnostics(params: {
  readonly rule: Rule;
  readonly assignmentActive: boolean;
}): RuleApplicabilityDiagnostics {
  const dosageWarnings = getDosageWarnings(params);
  const complianceWarnings = getComplianceWarnings(params.rule);
  const appliesToDosage = dosageWarnings.length === 0;
  const appliesToCompliance = appliesToDosage && complianceWarnings.length === 0;
  const warnings = [...dosageWarnings, ...complianceWarnings];
  return {
    appliesToDosage,
    appliesToCompliance,
    warnings,
    notApplicableReason: warnings.length > 0 ? warnings.join('; ') : null,
  };
}

function getDosageWarnings(params: {
  readonly rule: Rule;
  readonly assignmentActive: boolean;
}): string[] {
  const warnings: string[] = [];
  if (!params.assignmentActive) warnings.push('assignment inactive');
  if (!params.rule.isActive()) warnings.push('rule status is not ACTIVE');
  if (!params.rule.isCurrentlyValid()) warnings.push('rule is outside its validity window');
  return warnings;
}

function getComplianceWarnings(rule: Rule): string[] {
  const warnings: string[] = [];
  if (!rule.pdfFileUrl) warnings.push('missing PDF');
  if (!rule.isVectorized) warnings.push('PDF not vectorized');
  return warnings;
}
