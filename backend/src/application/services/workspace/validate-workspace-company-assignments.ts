import { CompanyKind } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { Company } from '../../../domain/entities/Company';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';
import { assertCompanyKindMatchesWorkspace } from './assert-company-kind-matches-workspace';

export async function validateWorkspaceCompanyAssignments(input: {
  readonly workspaceId: string;
  readonly companyIds: readonly string[];
  readonly userId: string;
  readonly workspaceRepository: IWorkspaceRepository;
  readonly workspaceMemberRepository: IWorkspaceMemberRepository;
  readonly companyRepository: ICompanyRepository;
}): Promise<Company[]> {
  const uniqueIds = [...new Set(input.companyIds.filter((id) => id.trim().length > 0))];
  if (uniqueIds.length === 0) return [];

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

  const userCompanies = await input.companyRepository.findManyByUserId(input.userId);
  const accessibleById = new Map(userCompanies.map((company) => [company.id, company]));
  const resolved: Company[] = [];

  for (const companyId of uniqueIds) {
    const company = accessibleById.get(companyId);
    if (!company) {
      throw AppError.forbidden(
        'You do not have access to one or more selected companies',
        'NO_COMPANY_ACCESS',
      );
    }
    if (company.kind !== workspace.kind) {
      throw AppError.badRequest(
        `Company kind must match workspace kind (${workspace.kind})`,
        'COMPANY_KIND_WORKSPACE_MISMATCH',
      );
    }
    await assertCompanyKindMatchesWorkspace({
      workspaceId: input.workspaceId,
      companyKind: company.kind as CompanyKind,
      userId: input.userId,
      workspaceRepository: input.workspaceRepository,
      workspaceMemberRepository: input.workspaceMemberRepository,
    });
    resolved.push(company);
  }

  return resolved;
}
