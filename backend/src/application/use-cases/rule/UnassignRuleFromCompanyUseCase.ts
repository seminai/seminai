import { IRuleRepository } from '../../../domain/repositories/IRuleRepository';
import { IRuleOnCompanyRepository } from '../../../domain/repositories/IRuleOnCompanyRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { AppError } from '../../../domain/errors/AppError';

interface UnassignRuleFromCompanyRequest {
  ruleId: string;
  companyId: string;
  userId: string;
}

export class UnassignRuleFromCompanyUseCase {
  constructor(
    private ruleRepository: IRuleRepository,
    private ruleOnCompanyRepository: IRuleOnCompanyRepository,
    private workspaceMemberRepository: IWorkspaceMemberRepository,
    private companyRepository: ICompanyRepository,
  ) {}

  async execute(request: UnassignRuleFromCompanyRequest): Promise<void> {
    const { ruleId, companyId, userId } = request;

    // Get rule
    const rule = await this.ruleRepository.findById(ruleId);
    if (!rule) {
      throw AppError.notFound('Rule not found', 'RULE_NOT_FOUND');
    }

    // Check user has permission
    const member = await this.workspaceMemberRepository.findByWorkspaceAndUser(
      rule.workspaceId,
      userId,
    );
    if (!member) {
      throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
    }
    if (!member.hasRuleManagementPermission()) {
      throw AppError.forbidden('You do not have permission to manage rules', 'NO_RULE_PERMISSION');
    }
    const accessibleCompanies = await this.companyRepository.findManyByUserId(userId);
    const canAccessCompany = accessibleCompanies.some((company) => company.id === companyId);
    if (!canAccessCompany) {
      throw AppError.forbidden('You do not have access to this company', 'NO_COMPANY_ACCESS');
    }

    // Check if assignment exists
    const assignment = await this.ruleOnCompanyRepository.findByRuleAndCompany(ruleId, companyId);
    if (!assignment) {
      throw AppError.notFound('Rule is not assigned to this company', 'ASSIGNMENT_NOT_FOUND');
    }

    await this.ruleOnCompanyRepository.deleteByRuleAndCompany(ruleId, companyId);
  }
}
