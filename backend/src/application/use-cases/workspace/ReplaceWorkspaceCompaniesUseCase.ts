import { ICompanyOnWorkspaceRepository } from '../../../domain/repositories/ICompanyOnWorkspaceRepository';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';
import { AppError } from '../../../domain/errors/AppError';
import { validateWorkspaceCompanyAssignments } from '../../services/workspace/validate-workspace-company-assignments';

interface ReplaceWorkspaceCompaniesRequest {
  readonly workspaceId: string;
  readonly userId: string;
  readonly companyIds: readonly string[];
}

export class ReplaceWorkspaceCompaniesUseCase {
  constructor(
    private readonly companyOnWorkspaceRepository: ICompanyOnWorkspaceRepository,
    private readonly companyRepository: ICompanyRepository,
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly workspaceMemberRepository: IWorkspaceMemberRepository,
  ) {}

  async execute(request: ReplaceWorkspaceCompaniesRequest) {
    const member = await this.workspaceMemberRepository.findByWorkspaceAndUser(
      request.workspaceId,
      request.userId,
    );
    if (!member) {
      throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
    }
    if (!member.hasInvitePermission()) {
      throw AppError.forbidden(
        'You do not have permission to manage workspace companies',
        'INSUFFICIENT_PERMISSIONS',
      );
    }

    await validateWorkspaceCompanyAssignments({
      workspaceId: request.workspaceId,
      companyIds: request.companyIds,
      userId: request.userId,
      workspaceRepository: this.workspaceRepository,
      workspaceMemberRepository: this.workspaceMemberRepository,
      companyRepository: this.companyRepository,
    });

    await this.companyOnWorkspaceRepository.replaceAssignments(
      request.workspaceId,
      request.companyIds,
      request.userId,
    );

    const companies = await this.companyOnWorkspaceRepository.findAssignmentsWithCompanies(
      request.workspaceId,
    );

    return { companies };
  }
}
