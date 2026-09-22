import { Request, Response } from 'express';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { AppError } from '../../../domain/errors/AppError';
import { CreateCompanyUseCase } from '../../../application/use-cases/company/CreateCompanyUseCase';
import { Company } from '../../../domain/entities/Company';
import { IUserOnCompanyRepository } from '../../../domain/repositories/IUserOnCompanyRepository';
import { IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import { IRuleOnCompanyRepository } from '../../../domain/repositories/IRuleOnCompanyRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';
import { ICompanyOnWorkspaceRepository } from '../../../domain/repositories/ICompanyOnWorkspaceRepository';
import { assertCompanyKindMatchesWorkspace } from '../../../application/services/workspace/assert-company-kind-matches-workspace';
import { resolveWorkspaceCompanyScope } from '../../../application/services/workspace/resolve-workspace-company-scope';
import { UserOnCompany } from '../../../domain/entities/UserOnCompany';
import { Field } from '../../../domain/entities/Field';
import { ProductionUnit } from '../../../domain/entities/ProductionUnit';
import { CompanyKind, CompanyRole, WorkspaceKind } from '@prisma/client';
import {
  CompanyDataExtractorAgent,
  CompanyDataExtraction,
} from '../../services/agents/company/company_data_extractor_agent';
import { VisuraCameralePdfAgent } from '../../services/agents/company/visura_camerale_pdf_agent';
import { FieldCsvAgent } from '../../services/agents/file_agent/field_csv_agent';
import { ProductionUnitCsvAgent } from '../../services/agents/production_unit/production_unit_csv_agent';
import { resolveFieldConductionDates } from '../../utils/field-conduction-dates';
import { resolveFieldSauHa } from '../../utils/resolve-field-sau-ha';
import { resolvePuDateOrDefault } from '../../utils/production-unit-date-defaults';

export class CompanyController {
  private companyDataExtractorAgent: CompanyDataExtractorAgent | null = null;
  private visuraCameraleAgent: VisuraCameralePdfAgent | null = null;

  constructor(
    private readonly companyRepository: ICompanyRepository,
    private readonly userOnCompanyRepository: IUserOnCompanyRepository,
    private readonly createCompanyUseCase: CreateCompanyUseCase,
    private readonly ruleOnCompanyRepository: IRuleOnCompanyRepository,
    private readonly workspaceRepository: IWorkspaceRepository,
    private readonly workspaceMemberRepository: IWorkspaceMemberRepository,
    private readonly companyOnWorkspaceRepository: ICompanyOnWorkspaceRepository,
    private readonly fieldRepository?: IFieldRepository,
    private readonly productionUnitRepository?: IProductionUnitRepository,
  ) {}

  async create(request: Request, response: Response): Promise<Response> {
    const {
      name,
      vatNumber,
      cuaa,
      fiscalCode,
      nation,
      city,
      address,
      cap,
      email,
      phoneNumber,
      website,
      logoUrl,
      kind,
      workspaceId,
    } = request.body;

    if (!name || !vatNumber) {
      throw AppError.badRequest('Missing required fields', 'MISSING_FIELDS');
    }

    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const result = await this.createCompanyUseCase.execute({
      name,
      vatNumber,
      cuaa,
      fiscalCode: fiscalCode ?? null,
      nation: nation ?? null,
      city: city ?? null,
      address: address ?? null,
      cap: cap ?? null,
      email: email ?? null,
      phoneNumber: phoneNumber ?? null,
      website: website ?? null,
      logoUrl: logoUrl ?? null,
      kind: kind ?? undefined,
      workspaceId: workspaceId ?? undefined,
      userId: request.user.id,
    });

    return response.status(201).json({
      status: 'success',
      data: {
        company: result.company,
        message: 'Company created successfully. You have been added as admin.',
      },
    });
  }

  async findById(request: Request, response: Response): Promise<Response> {
    const { id } = request.params;

    const company = await this.companyRepository.findById(id);

    if (!company) {
      throw AppError.notFound('Company not found', 'COMPANY_NOT_FOUND');
    }

    return response.json({
      status: 'success',
      data: { company },
    });
  }

  async update(request: Request, response: Response): Promise<Response> {
    const { id } = request.params;
    const updateData = request.body;

    const existingCompany = await this.companyRepository.findById(id);
    if (!existingCompany) {
      throw AppError.notFound('Company not found', 'COMPANY_NOT_FOUND');
    }

    if (updateData.vatNumber && updateData.vatNumber !== existingCompany.vatNumber) {
      const existingByVat = await this.companyRepository.findByVatNumber(updateData.vatNumber);
      if (existingByVat) {
        throw AppError.conflict('Company with this VAT number already exists', 'COMPANY_EXISTS');
      }
    }

    if (updateData.fiscalCode && updateData.fiscalCode !== existingCompany.fiscalCode) {
      const existingByFiscalCode = await this.companyRepository.findByFiscalCode(
        updateData.fiscalCode,
      );
      if (existingByFiscalCode) {
        throw AppError.conflict('Company with this fiscal code already exists', 'COMPANY_EXISTS');
      }
    }

    if (updateData.kind && updateData.kind !== existingCompany.kind) {
      await this.assertCompanyKindChangeAllowed(id, updateData.kind);
    }

    const updatedCompany = await this.companyRepository.update(id, updateData);

    return response.json({
      status: 'success',
      data: { company: updatedCompany },
    });
  }

  async updateBulk(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { companies } = request.body as {
      companies: Array<{ id: string } & Partial<Company>>;
    };
    if (!Array.isArray(companies) || companies.length === 0) {
      throw AppError.badRequest('Missing companies array', 'MISSING_FIELDS');
    }
    const invalidIndex = companies.findIndex((c) => !c.id);
    if (invalidIndex !== -1) {
      throw AppError.badRequest(`Missing id in companies[${invalidIndex}]`, 'MISSING_COMPANY_ID');
    }

    for (const companyUpdate of companies) {
      if (!companyUpdate.kind) continue;
      const existingCompany = await this.companyRepository.findById(companyUpdate.id);
      if (!existingCompany || existingCompany.kind === companyUpdate.kind) continue;
      await this.assertCompanyKindChangeAllowed(companyUpdate.id, companyUpdate.kind);
    }

    const updates = companies.map((c) => {
      const { id, ...data } = c;
      return { id, data };
    });
    const count = await this.companyRepository.updateMany(updates);
    return response.json({ status: 'success', data: { count } });
  }

  async delete(request: Request, response: Response): Promise<Response> {
    const { id } = request.params;

    const existingCompany = await this.companyRepository.findById(id);
    if (!existingCompany) {
      throw AppError.notFound('Company not found', 'COMPANY_NOT_FOUND');
    }

    await this.companyRepository.delete(id);

    return response.status(204).send();
  }

  async deleteBulkWithAllData(request: Request, response: Response): Promise<Response> {
    const { companyIds } = request.body as { companyIds: string[] };

    if (!Array.isArray(companyIds) || companyIds.length === 0) {
      throw AppError.badRequest('Missing companyIds array', 'MISSING_FIELDS');
    }

    let deletedCount = 0;
    for (const companyId of companyIds) {
      const existing = await this.companyRepository.findById(companyId);
      if (!existing) continue;
      await this.companyRepository.deleteWithAllData(companyId);
      deletedCount++;
    }

    return response.json({ status: 'success', data: { deletedCount } });
  }

  async deleteWithAllData(request: Request, response: Response): Promise<Response> {
    const { id } = request.params;

    const existingCompany = await this.companyRepository.findById(id);
    if (!existingCompany) {
      throw AppError.notFound('Company not found', 'COMPANY_NOT_FOUND');
    }

    await this.companyRepository.deleteWithAllData(id);

    return response.status(204).send();
  }

  async createBulk(request: Request, response: Response): Promise<Response> {
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

  async listForCurrentUser(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const workspaceId =
      typeof request.query.workspaceId === 'string' ? request.query.workspaceId.trim() : undefined;

    const companies =
      workspaceId && workspaceId.length > 0
        ? await resolveWorkspaceCompanyScope({
            userId: request.user.id,
            workspaceId,
            companyRepository: this.companyRepository,
            companyOnWorkspaceRepository: this.companyOnWorkspaceRepository,
            workspaceMemberRepository: this.workspaceMemberRepository,
          })
        : await this.companyRepository.findManyByUserId(request.user.id);

    return response.json({ status: 'success', data: { companies } });
  }

  /**
   * Extract company, fields, and production units from CSV/Excel file
   * If companyId is provided in the body, uses existing company and skips company extraction
   */
  async extractFromCsv(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const file = request.file;
    if (!file) {
      throw AppError.badRequest('No file uploaded', 'NO_FILE');
    }

    // Check if companyId is provided in the body (multipart/form-data)
    const companyId = request.body?.companyId as string | undefined;

    try {
      const agent = this.getCompanyDataExtractorAgent();

      // If companyId is provided, use existing company and skip extraction
      if (companyId) {
        // Validate company exists and user has access
        const company = await this.companyRepository.findById(companyId);
        if (!company) {
          throw AppError.notFound('Company not found', 'COMPANY_NOT_FOUND');
        }

        // Check user has access to this company
        const userOnCompany = await this.userOnCompanyRepository.findByCompanyAndUser(
          companyId,
          request.user.id,
        );
        if (!userOnCompany) {
          throw AppError.forbidden(
            'User does not have access to this company',
            'NO_COMPANY_ACCESS',
          );
        }

        // Extract only fields and production units (skip company extraction)
        const fieldAgent = new FieldCsvAgent();
        const productionUnitAgent = new ProductionUnitCsvAgent();

        const fieldsResult = await fieldAgent.extractFieldsFromCsv(file.buffer);
        const puExtractionResult = await productionUnitAgent.extractProductionUnitsFromCsv(
          file.buffer,
        );

        return response.json({
          status: 'success',
          data: {
            company: {
              id: company.id,
              name: company.name,
              vatNumber: company.vatNumber,
              fiscalCode: company.fiscalCode,
              cuaa: company.cuaa,
              nation: company.nation,
              region: null, // Company entity doesn't have region field
              city: company.city,
              address: company.address,
              cap: company.cap,
            },
            fields: fieldsResult.fields,
            productionUnits: puExtractionResult.units,
            summary: {
              fieldsCount: fieldsResult.fields.length,
              productionUnitsCount: puExtractionResult.units.length,
            },
            diagnostics: {
              fields: fieldsResult.diagnostics,
              productionUnits: puExtractionResult.diagnostics,
            },
          },
        });
      }

      // Default behavior: extract everything including company
      const extraction = await agent.extractFromCsv(file.buffer);

      return response.json({
        status: 'success',
        data: {
          companies: extraction.companies,
          company: extraction.company,
          fields: extraction.fields,
          productionUnits: extraction.productionUnits,
          summary: {
            fieldsCount: extraction.fields.length,
            productionUnitsCount: extraction.productionUnits.length,
          },
        },
      });
    } catch (error) {
      console.error('Error during company data extraction:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw AppError.internal('Company data extraction failed', 'EXTRACTION_FAILED');
    }
  }

  /**
   * Create company with fields and production units in a single transaction
   */
  async createWithData(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    if (!this.fieldRepository || !this.productionUnitRepository) {
      throw AppError.badRequest(
        'Field and ProductionUnit repositories not configured',
        'REPOSITORIES_NOT_CONFIGURED',
      );
    }

    const { company, fields, productionUnits } = request.body as CompanyDataExtraction;

    if (!company || !company.name) {
      throw AppError.badRequest('Missing company data', 'MISSING_COMPANY');
    }

    // Step 1: Create company
    const createdCompany = await this.createCompanyUseCase.execute({
      name: company.name,
      vatNumber: company.vatNumber || company.fiscalCode || `VAT-${Date.now()}`,
      cuaa: company.cuaa,
      fiscalCode: company.fiscalCode || company.vatNumber || `FC-${Date.now()}`,
      nation: company.nation,
      city: company.city,
      address: company.address,
      cap: company.cap,
      email: null,
      phoneNumber: null,
      website: null,
      logoUrl: null,
      userId: request.user.id,
    });

    const companyId = createdCompany.company.id;
    let createdFieldsCount = 0;
    let createdProductionUnitsCount = 0;

    // Step 2: Create fields if provided
    if (Array.isArray(fields) && fields.length > 0) {
      const fieldEntities = fields.map((f) => {
        const { inizioConduzione, fineConduzione } = resolveFieldConductionDates(
          f.inizioConduzione,
          f.fineConduzione,
        );
        return Field.create({
          companyId,
          sourceFileId:
            'sourceFileId' in f && typeof f.sourceFileId === 'string' ? f.sourceFileId : null,
          name: f.name,
          coordinates: [],
          latitude: null,
          longitude: null,
          polygon: null,
          gisHa: f.gisHa,
          sauHa: resolveFieldSauHa(f.sauHa, f.gisHa, f.superficieCatastaleMq),
          ph: f.ph,
          nitrogen: f.nitrogen,
          phosphorus: f.phosphorus,
          potassium: f.potassium,
          calcium: f.calcium,
          magnesium: f.magnesium,
          soilType: f.soilType,
          uso: f.uso,
          qualita: f.qualita,
          superficieCatastaleMq: f.superficieCatastaleMq || 0,
          sezione: f.sezione || 'UNSPECIFIED',
          foglio: f.foglio,
          particella: f.particella,
          subalterno: f.subalterno,
          nation: f.nation,
          region: f.region,
          city: f.city,
          address: f.address || 'N/A',
          cap: f.cap,
          variazioneMq: f.variazioneMq,
          inizioConduzione,
          fineConduzione,
          bufferZoneNotes: null,
        });
      });

      await this.fieldRepository.createMany(fieldEntities);
      createdFieldsCount = fieldEntities.length;
    }

    // Step 3: Create production units if provided
    if (Array.isArray(productionUnits) && productionUnits.length > 0) {
      const productionUnitEntities = productionUnits.map((pu) => {
        // Get first cycle for main crop info
        const primaryCycle = pu.cycles?.[0];

        return ProductionUnit.create({
          name: pu.name,
          areaHa: pu.areaHa ?? 0,
          cropName: primaryCycle?.cropName || 'Non specificato',
          cropType: primaryCycle?.cropType || 'Non specificato',
          variety: primaryCycle?.variety || 'Non specificata',
          protocoll: pu.protocoll || 'N/A',
          protectionStructure: primaryCycle?.protectionStructure || 'Nessuna',
          startDate: resolvePuDateOrDefault(pu.startDate, 'start'),
          endDate: resolvePuDateOrDefault(pu.endDate, 'end'),
          floweringDate: resolvePuDateOrDefault(primaryCycle?.floweringDate, 'start'),
          harvestingDate: resolvePuDateOrDefault(primaryCycle?.harvestingDate, 'end'),
          occupazione: primaryCycle?.occupazione || null,
          destinazioneDiUso: primaryCycle?.destinazione || null,
          acquaTotalePeridoL: 0,
        });
      });

      await this.productionUnitRepository.createMany(productionUnitEntities);
      createdProductionUnitsCount = productionUnitEntities.length;
    }

    return response.status(201).json({
      status: 'success',
      data: {
        company: createdCompany.company,
        createdFieldsCount,
        createdProductionUnitsCount,
        message: 'Company created with fields and production units',
      },
    });
  }

  private async assertCompanyKindChangeAllowed(
    companyId: string,
    newKind: CompanyKind,
  ): Promise<void> {
    const workspaceKinds =
      await this.ruleOnCompanyRepository.findDistinctWorkspaceKindsByCompanyId(companyId);
    const hasIncompatibleWorkspace = workspaceKinds.some((kind) => kind !== newKind);
    if (hasIncompatibleWorkspace) {
      throw AppError.badRequest(
        `Company kind must match linked workspace kind`,
        'COMPANY_KIND_WORKSPACE_MISMATCH',
      );
    }
  }

  private getCompanyDataExtractorAgent(): CompanyDataExtractorAgent {
    if (!this.companyDataExtractorAgent) {
      this.companyDataExtractorAgent = new CompanyDataExtractorAgent();
    }
    return this.companyDataExtractorAgent;
  }

  private getVisuraCameraleAgent(): VisuraCameralePdfAgent {
    if (!this.visuraCameraleAgent) {
      this.visuraCameraleAgent = new VisuraCameralePdfAgent();
    }
    return this.visuraCameraleAgent;
  }

  /**
   * Extract company data from a "visura camerale" PDF.
   * Does NOT persist the company — returns the extracted fields so the user
   * can review/edit before submitting POST /companies.
   */
  async extractFromVisura(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const file = request.file;
    if (!file) {
      throw AppError.badRequest('No file uploaded', 'NO_FILE');
    }

    const isPdf =
      file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      throw AppError.badRequest('Only PDF files are supported for visura', 'INVALID_FILE_TYPE');
    }

    try {
      const extracted = await this.getVisuraCameraleAgent().extractFromPdf(file.buffer);
      return response.json({ status: 'success', data: { extracted } });
    } catch (error) {
      console.error('Error during visura extraction:', error);
      if (error instanceof AppError) throw error;
      throw AppError.internal('Visura extraction failed', 'VISURA_EXTRACTION_FAILED');
    }
  }
}
