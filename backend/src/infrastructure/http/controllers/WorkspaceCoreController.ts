import type { Request, Response } from 'express';
import type { CreateWorkspaceUseCase } from '../../../application/use-cases/workspace/CreateWorkspaceUseCase';
import type { DeleteWorkspaceUseCase } from '../../../application/use-cases/workspace/DeleteWorkspaceUseCase';
import type { GetWorkspaceUseCase } from '../../../application/use-cases/workspace/GetWorkspaceUseCase';
import type { ListUserWorkspacesUseCase } from '../../../application/use-cases/workspace/ListUserWorkspacesUseCase';
import type { ListWorkspaceCompaniesUseCase } from '../../../application/use-cases/workspace/ListWorkspaceCompaniesUseCase';
import type { ReplaceWorkspaceCompaniesUseCase } from '../../../application/use-cases/workspace/ReplaceWorkspaceCompaniesUseCase';
import type { UpdateWorkspaceUseCase } from '../../../application/use-cases/workspace/UpdateWorkspaceUseCase';
import type { UploadLogoAndExtractColorsUseCase } from '../../../application/use-cases/workspace/UploadLogoAndExtractColorsUseCase';
import { AppError } from '../../../domain/errors/AppError';
import type { MulterFile } from '../../services/Multer';

export class WorkspaceCoreController {
  constructor(
    private readonly createWorkspaceUseCase: CreateWorkspaceUseCase,
    private readonly getWorkspaceUseCase: GetWorkspaceUseCase,
    private readonly listUserWorkspacesUseCase: ListUserWorkspacesUseCase,
    private readonly updateWorkspaceUseCase: UpdateWorkspaceUseCase,
    private readonly deleteWorkspaceUseCase: DeleteWorkspaceUseCase,
    private readonly uploadLogoAndExtractColorsUseCase: UploadLogoAndExtractColorsUseCase,
    private readonly listWorkspaceCompaniesUseCase: ListWorkspaceCompaniesUseCase,
    private readonly replaceWorkspaceCompaniesUseCase: ReplaceWorkspaceCompaniesUseCase,
  ) {}

  async create(request: Request, response: Response): Promise<Response> {
    const user = this.requireUser(request);
    const {
      name,
      kind,
      slug,
      description,
      logoUrl,
      iconUrl,
      primaryColor,
      secondaryColor,
      accentColor,
      plan,
      enabledModules,
      companyIds,
    } = request.body;
    if (!name) throw AppError.badRequest('Name is required', 'MISSING_NAME');
    if (kind === undefined || kind === null) {
      throw AppError.badRequest('kind is required', 'MISSING_KIND');
    }
    const result = await this.createWorkspaceUseCase.execute({
      data: {
        name,
        kind,
        slug,
        description,
        logoUrl,
        iconUrl,
        primaryColor,
        secondaryColor,
        accentColor,
        plan,
        enabledModules,
        companyIds: Array.isArray(companyIds)
          ? companyIds.filter((id): id is string => typeof id === 'string')
          : undefined,
      },
      userId: user.id,
      userRole: user.role,
    });
    return response.status(201).json({
      status: 'success',
      data: { workspace: result.workspace, member: result.member },
    });
  }

  async findById(request: Request, response: Response): Promise<Response> {
    const user = this.requireUser(request);
    const workspace = await this.getWorkspaceUseCase.execute({
      workspaceId: request.params.id,
      userId: user.id,
    });
    return response.json({ status: 'success', data: { workspace } });
  }

  async list(request: Request, response: Response): Promise<Response> {
    const user = this.requireUser(request);
    const workspaces = await this.listUserWorkspacesUseCase.execute(user.id);
    return response.json({ status: 'success', data: { workspaces } });
  }

  async update(request: Request, response: Response): Promise<Response> {
    const user = this.requireUser(request);
    const workspace = await this.updateWorkspaceUseCase.execute({
      workspaceId: request.params.id,
      userId: user.id,
      userRole: user.role,
      data: request.body,
    });
    return response.json({ status: 'success', data: { workspace } });
  }

  async delete(request: Request, response: Response): Promise<Response> {
    const user = this.requireUser(request);
    await this.deleteWorkspaceUseCase.execute({
      workspaceId: request.params.id,
      userId: user.id,
    });
    return response.status(204).send();
  }

  async uploadLogoAndExtractColors(request: Request, response: Response): Promise<Response> {
    const user = this.requireUser(request);
    const file = request.file as MulterFile | undefined;
    if (!file) throw AppError.badRequest('Logo file is required', 'MISSING_FILE');
    const result = await this.uploadLogoAndExtractColorsUseCase.execute({
      workspaceId: request.params.id,
      userId: user.id,
      file,
    });
    return response.json({
      status: 'success',
      data: {
        workspace: result.workspace,
        logoUrl: result.logoUrl,
        extractedColors: result.extractedColors,
      },
    });
  }

  async listCompanies(request: Request, response: Response): Promise<Response> {
    const user = this.requireUser(request);
    const result = await this.listWorkspaceCompaniesUseCase.execute({
      workspaceId: request.params.id,
      userId: user.id,
    });
    return response.json({ status: 'success', data: { companies: result.companies } });
  }

  async replaceCompanies(request: Request, response: Response): Promise<Response> {
    const user = this.requireUser(request);
    const { companyIds } = request.body;
    if (!Array.isArray(companyIds)) {
      throw AppError.badRequest('companyIds must be an array', 'INVALID_COMPANY_IDS');
    }
    const result = await this.replaceWorkspaceCompaniesUseCase.execute({
      workspaceId: request.params.id,
      userId: user.id,
      companyIds: companyIds.filter((value): value is string => typeof value === 'string'),
    });
    return response.json({ status: 'success', data: { companies: result.companies } });
  }

  private requireUser(request: Request) {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    return request.user;
  }
}
