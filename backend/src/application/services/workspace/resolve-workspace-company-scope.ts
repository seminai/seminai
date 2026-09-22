import { AppError } from '../../../domain/errors/AppError';
import { Company } from '../../../domain/entities/Company';
import { ICompanyOnWorkspaceRepository } from '../../../domain/repositories/ICompanyOnWorkspaceRepository';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';

export async function resolveWorkspaceCompanyScope(input: {
  readonly userId: string;
  readonly workspaceId: string;
  readonly companyRepository: ICompanyRepository;
  readonly companyOnWorkspaceRepository: ICompanyOnWorkspaceRepository;
  readonly workspaceMemberRepository: IWorkspaceMemberRepository;
}): Promise<Company[]> {
  const member = await input.workspaceMemberRepository.findByWorkspaceAndUser(
    input.workspaceId,
    input.userId,
  );
  if (!member) {
    throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
  }

  const userCompanies = await input.companyRepository.findManyByUserId(input.userId);
  const assignedIds = await input.companyOnWorkspaceRepository.findCompanyIdsByWorkspaceId(
    input.workspaceId,
  );

  if (assignedIds.length === 0) {
    return userCompanies;
  }

  const assignedSet = new Set(assignedIds);
  return userCompanies.filter((company) => assignedSet.has(company.id));
}
