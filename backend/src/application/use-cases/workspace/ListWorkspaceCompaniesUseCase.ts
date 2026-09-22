import { ICompanyOnWorkspaceRepository } from '../../../domain/repositories/ICompanyOnWorkspaceRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { AppError } from '../../../domain/errors/AppError';

interface ListWorkspaceCompaniesRequest {
  readonly workspaceId: string;
  readonly userId: string;
}

export class ListWorkspaceCompaniesUseCase {
  constructor(
    private readonly companyOnWorkspaceRepository: ICompanyOnWorkspaceRepository,
    private readonly workspaceMemberRepository: IWorkspaceMemberRepository,
  ) {}

  async execute(request: ListWorkspaceCompaniesRequest) {
    const member = await this.workspaceMemberRepository.findByWorkspaceAndUser(
      request.workspaceId,
      request.userId,
    );
    if (!member) {
      throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
    }

    const companies = await this.companyOnWorkspaceRepository.findAssignmentsWithCompanies(
      request.workspaceId,
    );

    return { companies };
  }
}
