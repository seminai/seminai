import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { Company } from '../../../domain/entities/Company';
import { assertCompanyKindMatchesWorkspace } from '../../../application/services/workspace/assert-company-kind-matches-workspace';
import { UserOnCompany } from '../../../domain/entities/UserOnCompany';
import { CompanyKind, CompanyRole, WorkspaceKind } from '@prisma/client';
import type { CompanyControllerContext } from './company-controller.context';

export async function companyControllerCreateBulk(this: CompanyControllerContext, request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { companies, workspaceId } = request.body as {
      workspaceId?: string;
      companies: Array<{
        name: string;
        vatNumber: string;
        cuaa?: string | null;
        fiscalCode: string;
        nation?: string | null;
        city?: string | null;
        address?: string | null;
        cap?: string | null;
        email?: string | null;
        phoneNumber?: string | null;
        website?: string | null;
        logoUrl?: string | null;
        ownerId?: string | null;
        kind?: CompanyKind;
      }>;
    };

    if (!Array.isArray(companies) || companies.length === 0) {
      throw AppError.badRequest('Missing companies array', 'MISSING_FIELDS');
    }

    // Validate required fields for each company entry
    const requiredKeys: Array<keyof (typeof companies)[number]> = [
      'name',
      'vatNumber',
      'fiscalCode',
    ];
    const invalidIndex = companies.findIndex((c) =>
      requiredKeys.some(
        (k) =>
          typeof (c as Record<string, unknown>)[k as string] !== 'string' ||
          !(c as Record<string, string>)[k as string]?.trim(),
      ),
    );
    if (invalidIndex !== -1) {
      throw AppError.badRequest(
        `Missing required fields in companies[${invalidIndex}]`,
        'MISSING_FIELDS',
      );
    }

    let bulkWorkspaceKind: WorkspaceKind | null = null;
    if (workspaceId) {
      const workspace = await this.workspaceRepository.findById(workspaceId);
      if (!workspace) {
        throw AppError.notFound('Workspace not found', 'WORKSPACE_NOT_FOUND');
      }
      bulkWorkspaceKind = await assertCompanyKindMatchesWorkspace({
        workspaceId,
        companyKind: workspace.kind,
        userId: request.user.id,
        workspaceRepository: this.workspaceRepository,
        workspaceMemberRepository: this.workspaceMemberRepository,
      });
    }

    const toCreate = companies.map((c) => {
      const resolvedKind = bulkWorkspaceKind ?? c.kind ?? CompanyKind.AGRICULTURAL;
      if (bulkWorkspaceKind && c.kind && c.kind !== bulkWorkspaceKind) {
        throw AppError.badRequest(
          `Company kind must match workspace kind (${bulkWorkspaceKind})`,
          'COMPANY_KIND_WORKSPACE_MISMATCH',
        );
      }
      return Company.create({
        name: c.name,
        vatNumber: c.vatNumber,
        cuaa: c.cuaa ?? null,
        ownerId: c.ownerId ?? request.user!.id,
        fiscalCode: c.fiscalCode,
        nation: c.nation ?? null,
        city: c.city ?? null,
        address: c.address ?? null,
        cap: c.cap ?? null,
        email: c.email ?? null,
        phoneNumber: c.phoneNumber ?? null,
        website: c.website ?? null,
        logoUrl: c.logoUrl ?? null,
        kind: resolvedKind,
      });
    });

    await this.companyRepository.createMany(toCreate);

    // Assign user as ADMIN to each created company
    const userAssignments = toCreate.map((company) =>
      UserOnCompany.create({
        companyId: company.id,
        userId: request.user!.id,
        role: CompanyRole.ADMIN,
        type: null,
      }),
    );

    for (const assignment of userAssignments) {
      await this.userOnCompanyRepository.create(assignment);
    }

    return response.status(201).json({ status: 'success', data: { count: toCreate.length } });
  }
