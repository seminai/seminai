import { Request, Response } from 'express';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { CreateCompanyUseCase } from '../../../application/use-cases/company/CreateCompanyUseCase';
import { IUserOnCompanyRepository } from '../../../domain/repositories/IUserOnCompanyRepository';
import { IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import { IRuleOnCompanyRepository } from '../../../domain/repositories/IRuleOnCompanyRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';
import { ICompanyOnWorkspaceRepository } from '../../../domain/repositories/ICompanyOnWorkspaceRepository';
import { CompanyKind } from '@prisma/client';
import { CompanyDataExtractorAgent } from '../../services/agents/company/company_data_extractor_agent';
import { VisuraCameralePdfAgent } from '../../services/agents/company/visura_camerale_pdf_agent';
import type { CompanyControllerContext } from './company-controller.context';
import { companyControllerCreate } from './company-controller.01-create';
import { companyControllerFindById } from './company-controller.02-find-by-id';
import { companyControllerUpdate } from './company-controller.03-update';
import { companyControllerUpdateBulk } from './company-controller.04-update-bulk';
import { companyControllerDelete } from './company-controller.05-delete';
import { companyControllerDeleteBulkWithAllData } from './company-controller.06-delete-bulk-with-all-data';
import { companyControllerDeleteWithAllData } from './company-controller.07-delete-with-all-data';
import { companyControllerCreateBulk } from './company-controller.08-create-bulk';
import { companyControllerListForCurrentUser } from './company-controller.09-list-for-current-user';
import { companyControllerExtractFromCsv } from './company-controller.10-extract-from-csv';
import { companyControllerCreateWithData } from './company-controller.11-create-with-data';
import { companyControllerAssertCompanyKindChangeAllowed } from './company-controller.12-assert-company-kind-change-allowed';
import { companyControllerGetCompanyDataExtractorAgent } from './company-controller.13-get-company-data-extractor-agent';
import { companyControllerGetVisuraCameraleAgent } from './company-controller.14-get-visura-camerale-agent';
import { companyControllerExtractFromVisura } from './company-controller.15-extract-from-visura';


export class CompanyController {

  companyDataExtractorAgent: CompanyDataExtractorAgent | null = null;
  visuraCameraleAgent: VisuraCameralePdfAgent | null = null;

  constructor(
    readonly companyRepository: ICompanyRepository,
    readonly userOnCompanyRepository: IUserOnCompanyRepository,
    readonly createCompanyUseCase: CreateCompanyUseCase,
    readonly ruleOnCompanyRepository: IRuleOnCompanyRepository,
    readonly workspaceRepository: IWorkspaceRepository,
    readonly workspaceMemberRepository: IWorkspaceMemberRepository,
    readonly companyOnWorkspaceRepository: ICompanyOnWorkspaceRepository,
    readonly fieldRepository?: IFieldRepository,
    readonly productionUnitRepository?: IProductionUnitRepository,
  ) {}

  async create(request: Request, response: Response): Promise<Response> {
    return companyControllerCreate.call(this as unknown as CompanyControllerContext, request, response);
  }

  async findById(request: Request, response: Response): Promise<Response> {
    return companyControllerFindById.call(this as unknown as CompanyControllerContext, request, response);
  }

  async update(request: Request, response: Response): Promise<Response> {
    return companyControllerUpdate.call(this as unknown as CompanyControllerContext, request, response);
  }

  async updateBulk(request: Request, response: Response): Promise<Response> {
    return companyControllerUpdateBulk.call(this as unknown as CompanyControllerContext, request, response);
  }

  async delete(request: Request, response: Response): Promise<Response> {
    return companyControllerDelete.call(this as unknown as CompanyControllerContext, request, response);
  }

  async deleteBulkWithAllData(request: Request, response: Response): Promise<Response> {
    return companyControllerDeleteBulkWithAllData.call(this as unknown as CompanyControllerContext, request, response);
  }

  async deleteWithAllData(request: Request, response: Response): Promise<Response> {
    return companyControllerDeleteWithAllData.call(this as unknown as CompanyControllerContext, request, response);
  }

  async createBulk(request: Request, response: Response): Promise<Response> {
    return companyControllerCreateBulk.call(this as unknown as CompanyControllerContext, request, response);
  }

  async listForCurrentUser(request: Request, response: Response): Promise<Response> {
    return companyControllerListForCurrentUser.call(this as unknown as CompanyControllerContext, request, response);
  }

  /**
   * Extract company, fields, and production units from CSV/Excel file
   * If companyId is provided in the body, uses existing company and skips company extraction
   */
  async extractFromCsv(request: Request, response: Response): Promise<Response> {
    return companyControllerExtractFromCsv.call(this as unknown as CompanyControllerContext, request, response);
  }

  /**
   * Create company with fields and production units in a single transaction
   */
  async createWithData(request: Request, response: Response): Promise<Response> {
    return companyControllerCreateWithData.call(this as unknown as CompanyControllerContext, request, response);
  }

  async assertCompanyKindChangeAllowed(
    companyId: string,
    newKind: CompanyKind,
  ): Promise<void> {
    return companyControllerAssertCompanyKindChangeAllowed.call(this as unknown as CompanyControllerContext, companyId, newKind);
  }

  getCompanyDataExtractorAgent(): CompanyDataExtractorAgent {
    return companyControllerGetCompanyDataExtractorAgent.call(this as unknown as CompanyControllerContext);
  }

  getVisuraCameraleAgent(): VisuraCameralePdfAgent {
    return companyControllerGetVisuraCameraleAgent.call(this as unknown as CompanyControllerContext);
  }

  /**
   * Extract company data from a "visura camerale" PDF.
   * Does NOT persist the company — returns the extracted fields so the user
   * can review/edit before submitting POST /companies.
   */
  async extractFromVisura(request: Request, response: Response): Promise<Response> {
    return companyControllerExtractFromVisura.call(this as unknown as CompanyControllerContext, request, response);
  }
}
