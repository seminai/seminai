import { RuleOnCompany } from '../../../domain/entities/RuleOnCompany';
import { Rule } from '../../../domain/entities/Rule';
import { IRuleRepository } from '../../../domain/repositories/IRuleRepository';
import { IRuleOnCompanyRepository } from '../../../domain/repositories/IRuleOnCompanyRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { AssignRuleToCompanyDTO } from '../../../domain/dtos/rule.dto';
import { AppError } from '../../../domain/errors/AppError';
import { assertCompanyKindMatchesWorkspace } from '../../services/workspace/assert-company-kind-matches-workspace';

interface AssignRuleToCompanyRequest {
  data: AssignRuleToCompanyDTO;
}

export class AssignRuleToCompanyUseCase {
  constructor(
    private ruleRepository: IRuleRepository,
    private ruleOnCompanyRepository: IRuleOnCompanyRepository,
    private workspaceRepository: IWorkspaceRepository,
    private workspaceMemberRepository: IWorkspaceMemberRepository,
    private companyRepository: ICompanyRepository,
  ) {}

  async execute(request: AssignRuleToCompanyRequest): Promise<RuleOnCompany> {
    const { data } = request;
    const { ruleId, companyId, assignedById } = data;

    // Get rule
    const rule = await this.ruleRepository.findById(ruleId);
    if (!rule) {
      throw AppError.notFound('Rule not found', 'RULE_NOT_FOUND');
    }

    await this.assertCanAssignRule(rule, data.workspaceId, assignedById);

    // Check company exists
    const company = await this.companyRepository.findById(companyId);
    if (!company) {
      throw AppError.notFound('Company not found', 'COMPANY_NOT_FOUND');
    }
    const accessibleCompanies = await this.companyRepository.findManyByUserId(assignedById);
    const canAccessCompany = accessibleCompanies.some((item) => item.id === companyId);
    if (!canAccessCompany) {
      throw AppError.forbidden('You do not have access to this company', 'NO_COMPANY_ACCESS');
    }

    const workspaceIdForKindCheck =
      rule.isPublic && data.workspaceId ? data.workspaceId : rule.workspaceId;

    await assertCompanyKindMatchesWorkspace({
      workspaceId: workspaceIdForKindCheck,
      companyKind: company.kind,
      userId: assignedById,
      workspaceRepository: this.workspaceRepository,
      workspaceMemberRepository: this.workspaceMemberRepository,
    });

    // Check if already assigned
    const existingAssignment = await this.ruleOnCompanyRepository.findByRuleAndCompany(
      ruleId,
      companyId,
    );
    if (existingAssignment) {
      throw AppError.conflict('Rule is already assigned to this company', 'RULE_ALREADY_ASSIGNED');
    }

    // Create assignment
    const assignment = RuleOnCompany.create({
      ruleId,
      companyId,
      isActive: true,
      priority: data.priority ?? 0,
      overrides: data.overrides ?? null,
      notes: data.notes ?? null,
      assignedById,
    });

    return this.ruleOnCompanyRepository.create(assignment);
  }

  private async assertCanAssignRule(
    rule: Rule,
    workspaceId: string | undefined,
    userId: string,
  ): Promise<void> {
    const sourceMember = await this.workspaceMemberRepository.findByWorkspaceAndUser(
      rule.workspaceId,
      userId,
    );
    if (sourceMember?.hasRuleManagementPermission()) return;
    if (!rule.isPublic) {
      if (!sourceMember) {
        throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
      }
      throw AppError.forbidden('You do not have permission to manage rules', 'NO_RULE_PERMISSION');
    }
    if (!workspaceId) {
      throw AppError.badRequest(
        'Workspace ID is required for public rules',
        'MISSING_WORKSPACE_ID',
      );
    }
    const targetMember = await this.workspaceMemberRepository.findByWorkspaceAndUser(
      workspaceId,
      userId,
    );
    if (!targetMember) {
      throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
    }
    if (!targetMember.hasRuleManagementPermission()) {
      throw AppError.forbidden('You do not have permission to manage rules', 'NO_RULE_PERMISSION');
    }
  }
}
