import { Workspace } from '../../../domain/entities/Workspace';
import { WorkspaceMember } from '../../../domain/entities/WorkspaceMember';
import { CompanyOnWorkspace } from '../../../domain/entities/CompanyOnWorkspace';
import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { ICompanyOnWorkspaceRepository } from '../../../domain/repositories/ICompanyOnWorkspaceRepository';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { CreateWorkspaceDTO } from '../../../domain/dtos/workspace.dto';
import { AppError } from '../../../domain/errors/AppError';
import { UserRole, WorkspaceRole } from '@prisma/client';
import { WorkspacePlanLimitsPolicy } from '../../services/workspace/WorkspacePlanLimitsPolicy';
import { resolveEnabledModules } from '../../services/workspace/resolveEnabledModules';
import { assertWorkspaceKind } from '../../../domain/validation/assert-workspace-kind';
import { validateWorkspaceCompanyAssignments } from '../../services/workspace/validate-workspace-company-assignments';

interface CreateWorkspaceRequest {
  data: CreateWorkspaceDTO;
  userId: string;
  userRole?: UserRole;
}

interface CreateWorkspaceResponse {
  workspace: Workspace;
  member: WorkspaceMember;
}

export class CreateWorkspaceUseCase {
  constructor(
    private workspaceRepository: IWorkspaceRepository,
    private workspaceMemberRepository: IWorkspaceMemberRepository,
    private companyOnWorkspaceRepository: ICompanyOnWorkspaceRepository,
    private companyRepository: ICompanyRepository,
  ) {}

  async execute(request: CreateWorkspaceRequest): Promise<CreateWorkspaceResponse> {
    const { data, userId, userRole } = request;

    const kind = assertWorkspaceKind(data.kind);

    const slug = data.slug || Workspace.generateSlug(data.name);

    const existingWorkspace = await this.workspaceRepository.findBySlug(slug);
    if (existingWorkspace) {
      throw AppError.conflict('A workspace with this slug already exists', 'WORKSPACE_SLUG_EXISTS');
    }

    const workspacePlan = data.plan || 'FREE';
    const planLimits = WorkspacePlanLimitsPolicy.getLimits(workspacePlan);

    const workspace = Workspace.create({
      name: data.name,
      slug,
      description: data.description ?? null,
      logoUrl: data.logoUrl ?? null,
      iconUrl: data.iconUrl ?? null,
      primaryColor: data.primaryColor ?? null,
      secondaryColor: data.secondaryColor ?? null,
      accentColor: data.accentColor ?? null,
      customCss: null,
      kind,
      plan: workspacePlan,
      isActive: true,
      maxMembers: planLimits.maxMembers,
      maxRules: planLimits.maxRules,
      enabledModules: resolveEnabledModules(data.enabledModules, userRole),
    });

    const createdWorkspace = await this.workspaceRepository.create(workspace);

    const member = WorkspaceMember.create({
      workspaceId: createdWorkspace.id,
      userId,
      role: WorkspaceRole.OWNER,
      canManageRules: true,
      canInviteMembers: true,
    });

    const createdMember = await this.workspaceMemberRepository.create(member);

    const companyIds = data.companyIds ?? [];
    if (companyIds.length > 0) {
      const validated = await validateWorkspaceCompanyAssignments({
        workspaceId: createdWorkspace.id,
        companyIds,
        userId,
        workspaceRepository: this.workspaceRepository,
        workspaceMemberRepository: this.workspaceMemberRepository,
        companyRepository: this.companyRepository,
      });
      const assignments = validated.map((company) =>
        CompanyOnWorkspace.create({
          workspaceId: createdWorkspace.id,
          companyId: company.id,
          assignedById: userId,
        }),
      );
      await this.companyOnWorkspaceRepository.createMany(assignments);
    }

    return {
      workspace: createdWorkspace,
      member: createdMember,
    };
  }
}
