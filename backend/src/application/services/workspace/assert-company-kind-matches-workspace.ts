import { CompanyKind, WorkspaceKind } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';

export async function assertCompanyKindMatchesWorkspace(input: {
  readonly workspaceId: string;
  readonly companyKind: CompanyKind;
  readonly userId: string;
  readonly workspaceRepository: IWorkspaceRepository;
  readonly workspaceMemberRepository: IWorkspaceMemberRepository;
}): Promise<WorkspaceKind> {
  const workspace = await input.workspaceRepository.findById(input.workspaceId);
  if (!workspace) {
    throw AppError.notFound('Workspace not found', 'WORKSPACE_NOT_FOUND');
  }

  const member = await input.workspaceMemberRepository.findByWorkspaceAndUser(
    input.workspaceId,
    input.userId,
  );
  if (!member) {
    throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
  }

  if (input.companyKind !== workspace.kind) {
    throw AppError.badRequest(
      `Company kind must match workspace kind (${workspace.kind})`,
      'COMPANY_KIND_WORKSPACE_MISMATCH',
    );
  }

  return workspace.kind;
}
