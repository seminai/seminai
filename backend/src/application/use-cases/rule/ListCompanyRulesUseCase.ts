import { Rule } from '../../../domain/entities/Rule';
import { IRuleRepository } from '../../../domain/repositories/IRuleRepository';
import { IRuleOnCompanyRepository } from '../../../domain/repositories/IRuleOnCompanyRepository';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { AppError } from '../../../domain/errors/AppError';
import type { RuleApplicabilityDiagnosticsDTO } from '../../../domain/dtos/rule.dto';
import {
  getRuleApplicabilityDiagnostics,
  type RuleApplicabilityDiagnostics,
} from './rule-applicability-diagnostics';

interface ListCompanyRulesRequest {
  companyId: string;
  userId: string;
  onlyActive?: boolean;
}

interface CompanyRuleWithAssignment extends RuleApplicabilityDiagnosticsDTO {
  rule: Rule;
  isActive: boolean;
  priority: number;
  notes: string | null;
  assignedAt: Date;
}

export class ListCompanyRulesUseCase {
  constructor(
    private ruleRepository: IRuleRepository,
    private ruleOnCompanyRepository: IRuleOnCompanyRepository,
    private companyRepository: ICompanyRepository,
  ) {}

  async execute(request: ListCompanyRulesRequest): Promise<CompanyRuleWithAssignment[]> {
    const { companyId, userId, onlyActive } = request;

    // Check company exists
    const company = await this.companyRepository.findById(companyId);
    if (!company) {
      throw AppError.notFound('Company not found', 'COMPANY_NOT_FOUND');
    }
    const accessibleCompanies = await this.companyRepository.findManyByUserId(userId);
    const canAccessCompany = accessibleCompanies.some((item) => item.id === companyId);
    if (!canAccessCompany) {
      throw AppError.forbidden('You do not have access to this company', 'NO_COMPANY_ACCESS');
    }

    // Get assignments
    const assignments = onlyActive
      ? await this.ruleOnCompanyRepository.findActiveByCompanyId(companyId)
      : await this.ruleOnCompanyRepository.findByCompanyId(companyId);

    // Get rules for each assignment
    const results: CompanyRuleWithAssignment[] = [];
    for (const assignment of assignments) {
      const rule = await this.ruleRepository.findById(assignment.ruleId);
      if (rule) {
        const diagnostics = getRuleApplicabilityDiagnostics({
          rule,
          assignmentActive: assignment.isActive,
        });
        results.push({
          rule,
          isActive: assignment.isActive,
          priority: assignment.priority,
          notes: assignment.notes,
          assignedAt: assignment.assignedAt,
          ...toDiagnosticFields(diagnostics),
        });
      }
    }

    // Sort by priority
    results.sort((a, b) => a.priority - b.priority);

    return results;
  }
}

function toDiagnosticFields(diagnostics: RuleApplicabilityDiagnostics): {
  readonly appliesToDosage: RuleApplicabilityDiagnosticsDTO['appliesToDosage'];
  readonly appliesToCompliance: RuleApplicabilityDiagnosticsDTO['appliesToCompliance'];
  readonly warnings: RuleApplicabilityDiagnosticsDTO['warnings'];
  readonly notApplicableReason: RuleApplicabilityDiagnosticsDTO['notApplicableReason'];
} {
  return {
    appliesToDosage: diagnostics.appliesToDosage,
    appliesToCompliance: diagnostics.appliesToCompliance,
    warnings: diagnostics.warnings,
    notApplicableReason: diagnostics.notApplicableReason,
  };
}
