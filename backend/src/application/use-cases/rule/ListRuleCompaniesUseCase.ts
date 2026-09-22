import { IRuleRepository } from '../../../domain/repositories/IRuleRepository';
import { IRuleOnCompanyRepository } from '../../../domain/repositories/IRuleOnCompanyRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { AppError } from '../../../domain/errors/AppError';

interface ListRuleCompaniesRequest {
  ruleId: string;
  userId: string;
}

interface RuleCompanyAssignment {
  assignment: {
    id: string;
    ruleId: string;
    companyId: string;
    isActive: boolean;
    priority: number;
    overrides: unknown;
    notes: string | null;
    assignedAt: Date;
    assignedById: string;
  };
  company: {
    id: string;
    name: string;
    vatNumber: string | null;
    address: string | null;
  };
}

export class ListRuleCompaniesUseCase {
  constructor(
    private ruleRepository: IRuleRepository,
    private ruleOnCompanyRepository: IRuleOnCompanyRepository,
    private workspaceMemberRepository: IWorkspaceMemberRepository,
    private companyRepository: ICompanyRepository,
  ) {}

  async execute(request: ListRuleCompaniesRequest): Promise<RuleCompanyAssignment[]> {
    const { ruleId, userId } = request;

    // Get rule
    const rule = await this.ruleRepository.findById(ruleId);
    if (!rule) {
      throw AppError.notFound('Rule not found', 'RULE_NOT_FOUND');
    }

    // Check access: if rule is public, anyone can view, otherwise check workspace membership
    if (!rule.isPublic) {
      const member = await this.workspaceMemberRepository.findByWorkspaceAndUser(
        rule.workspaceId,
        userId,
      );
      if (!member) {
        throw AppError.forbidden('You do not have access to this rule', 'NO_RULE_ACCESS');
      }
    }

    // Get all assignments for this rule
    const assignments = await this.ruleOnCompanyRepository.findByRuleId(ruleId);
    const accessibleCompanies = await this.companyRepository.findManyByUserId(userId);
    const accessibleCompanyMap = new Map(
      accessibleCompanies.map((company) => [company.id, company] as const),
    );

    // Get company details for each assignment
    const results: RuleCompanyAssignment[] = [];
    for (const assignment of assignments) {
      const company = accessibleCompanyMap.get(assignment.companyId);
      if (company) {
        results.push({
          assignment: {
            id: assignment.id,
            ruleId: assignment.ruleId,
            companyId: assignment.companyId,
            isActive: assignment.isActive,
            priority: assignment.priority,
            overrides: assignment.overrides,
            notes: assignment.notes,
            assignedAt: assignment.assignedAt,
            assignedById: assignment.assignedById,
          },
          company: {
            id: company.id,
            name: company.name,
            vatNumber: company.vatNumber,
            address: company.address,
          },
        });
      }
    }

    // Sort by priority
    results.sort((a, b) => a.assignment.priority - b.assignment.priority);

    return results;
  }
}
