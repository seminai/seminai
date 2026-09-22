import { Company } from '../../../domain/entities/Company';
import { UserOnCompany } from '../../../domain/entities/UserOnCompany';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { IUserOnCompanyRepository } from '../../../domain/repositories/IUserOnCompanyRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';
import { ICompanyOnWorkspaceRepository } from '../../../domain/repositories/ICompanyOnWorkspaceRepository';
import { CompanyRole, CompanyKind } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { assertCompanyKindMatchesWorkspace } from '../../services/workspace/assert-company-kind-matches-workspace';

interface CreateCompanyDTO {
  name: string;
  vatNumber: string;
  cuaa?: string | null;
  fiscalCode: string | null;
  nation: string | null;
  city: string | null;
  address: string | null;
  cap: string | null;
  email: string | null;
  phoneNumber: string | null;
  website: string | null;
  logoUrl: string | null;
  kind?: CompanyKind;
  workspaceId?: string;
  userId: string;
}

export class CreateCompanyUseCase {
  constructor(
    private companyRepository: ICompanyRepository,
    private userOnCompanyRepository: IUserOnCompanyRepository,
    private workspaceRepository: IWorkspaceRepository,
    private workspaceMemberRepository: IWorkspaceMemberRepository,
    private companyOnWorkspaceRepository: ICompanyOnWorkspaceRepository,
  ) {}

  async execute(
    data: CreateCompanyDTO,
  ): Promise<{ company: Company; userOnCompany: UserOnCompany }> {
    const existingByVat = await this.companyRepository.findByVatNumber(data.vatNumber);
    if (existingByVat) {
      throw AppError.conflict('Company with this VAT number already exists', 'COMPANY_EXISTS');
    }

    const fiscalCode = data.fiscalCode?.trim() ?? '';
    if (fiscalCode.length > 0) {
      const existingByFiscalCode = await this.companyRepository.findByFiscalCode(fiscalCode);
      if (existingByFiscalCode) {
        throw AppError.conflict('Company with this fiscal code already exists', 'COMPANY_EXISTS');
      }
    }

    let resolvedKind = data.kind ?? CompanyKind.AGRICULTURAL;
    if (data.workspaceId) {
      if (data.kind !== undefined) {
        resolvedKind = await assertCompanyKindMatchesWorkspace({
          workspaceId: data.workspaceId,
          companyKind: data.kind,
          userId: data.userId,
          workspaceRepository: this.workspaceRepository,
          workspaceMemberRepository: this.workspaceMemberRepository,
        });
      } else {
        const workspace = await this.workspaceRepository.findById(data.workspaceId);
        if (!workspace) {
          throw AppError.notFound('Workspace not found', 'WORKSPACE_NOT_FOUND');
        }
        resolvedKind = await assertCompanyKindMatchesWorkspace({
          workspaceId: data.workspaceId,
          companyKind: workspace.kind,
          userId: data.userId,
          workspaceRepository: this.workspaceRepository,
          workspaceMemberRepository: this.workspaceMemberRepository,
        });
      }
    }

    const company = Company.create({
      name: data.name,
      vatNumber: data.vatNumber,
      cuaa: data.cuaa ?? null,
      ownerId: data.userId,
      fiscalCode,
      nation: data.nation,
      city: data.city,
      address: data.address,
      cap: data.cap,
      email: data.email,
      phoneNumber: data.phoneNumber,
      website: data.website,
      logoUrl: data.logoUrl,
      kind: resolvedKind,
    });

    if (!company.isValidVatNumber()) {
      throw AppError.badRequest('Invalid VAT number format', 'INVALID_VAT_NUMBER');
    }

    if (fiscalCode.length > 0 && !company.isValidFiscalCode()) {
      throw AppError.badRequest('Invalid fiscal code format', 'INVALID_FISCAL_CODE');
    }

    const createdCompany = await this.companyRepository.create(company);

    const userOnCompany = UserOnCompany.create({
      companyId: createdCompany.id,
      userId: data.userId,
      type: null,
      role: CompanyRole.ADMIN,
    });

    const createdUserOnCompany = await this.userOnCompanyRepository.create(userOnCompany);

    if (data.workspaceId) {
      await this.companyOnWorkspaceRepository.assignCompany(
        data.workspaceId,
        createdCompany.id,
        data.userId,
      );
    }

    return {
      company: createdCompany,
      userOnCompany: createdUserOnCompany,
    };
  }
}
