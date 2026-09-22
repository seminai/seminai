import { Request, Response } from 'express';
import { CreateWorkspaceUseCase } from '../../../application/use-cases/workspace/CreateWorkspaceUseCase';
import { GetWorkspaceUseCase } from '../../../application/use-cases/workspace/GetWorkspaceUseCase';
import { ListUserWorkspacesUseCase } from '../../../application/use-cases/workspace/ListUserWorkspacesUseCase';
import { UpdateWorkspaceUseCase } from '../../../application/use-cases/workspace/UpdateWorkspaceUseCase';
import { DeleteWorkspaceUseCase } from '../../../application/use-cases/workspace/DeleteWorkspaceUseCase';
import { InviteMemberUseCase } from '../../../application/use-cases/workspace/InviteMemberUseCase';
import { AcceptInvitationUseCase } from '../../../application/use-cases/workspace/AcceptInvitationUseCase';
import { RemoveMemberUseCase } from '../../../application/use-cases/workspace/RemoveMemberUseCase';
import { UpdateMemberUseCase } from '../../../application/use-cases/workspace/UpdateMemberUseCase';
import { ListWorkspaceMembersUseCase } from '../../../application/use-cases/workspace/ListWorkspaceMembersUseCase';
import { UploadLogoAndExtractColorsUseCase } from '../../../application/use-cases/workspace/UploadLogoAndExtractColorsUseCase';
import { ListUserPendingInvitationsUseCase } from '../../../application/use-cases/workspace/ListUserPendingInvitationsUseCase';
import { DeleteInvitationUseCase } from '../../../application/use-cases/workspace/DeleteInvitationUseCase';
import { ListWorkspaceCompaniesUseCase } from '../../../application/use-cases/workspace/ListWorkspaceCompaniesUseCase';
import { ReplaceWorkspaceCompaniesUseCase } from '../../../application/use-cases/workspace/ReplaceWorkspaceCompaniesUseCase';
import { AppError } from '../../../domain/errors/AppError';
import { MulterFile } from '../../services/Multer';

export class WorkspaceController {
  constructor(
    private createWorkspaceUseCase: CreateWorkspaceUseCase,
    private getWorkspaceUseCase: GetWorkspaceUseCase,
    private listUserWorkspacesUseCase: ListUserWorkspacesUseCase,
    private updateWorkspaceUseCase: UpdateWorkspaceUseCase,
    private deleteWorkspaceUseCase: DeleteWorkspaceUseCase,
    private inviteMemberUseCase: InviteMemberUseCase,
    private acceptInvitationUseCase: AcceptInvitationUseCase,
    private removeMemberUseCase: RemoveMemberUseCase,
    private updateMemberUseCase: UpdateMemberUseCase,
    private listWorkspaceMembersUseCase: ListWorkspaceMembersUseCase,
    private uploadLogoAndExtractColorsUseCase: UploadLogoAndExtractColorsUseCase,
    private listUserPendingInvitationsUseCase: ListUserPendingInvitationsUseCase,
    private deleteInvitationUseCase: DeleteInvitationUseCase,
    private listWorkspaceCompaniesUseCase: ListWorkspaceCompaniesUseCase,
    private replaceWorkspaceCompaniesUseCase: ReplaceWorkspaceCompaniesUseCase,
  ) {}

  async create(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

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

    if (!name) {
      throw AppError.badRequest('Name is required', 'MISSING_NAME');
    }

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
      userId: request.user.id,
      userRole: request.user.role,
    });

    return response.status(201).json({
      status: 'success',
      data: {
        workspace: result.workspace,
        member: result.member,
      },
    });
  }

  async findById(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { id } = request.params;
    const workspace = await this.getWorkspaceUseCase.execute({
      workspaceId: id,
      userId: request.user.id,
    });

    return response.json({
      status: 'success',
      data: { workspace },
    });
  }

  async list(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const workspaces = await this.listUserWorkspacesUseCase.execute(request.user.id);

    return response.json({
      status: 'success',
      data: { workspaces },
    });
  }

  async update(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { id } = request.params;
    const updateData = request.body;

    const workspace = await this.updateWorkspaceUseCase.execute({
      workspaceId: id,
      userId: request.user.id,
      userRole: request.user.role,
      data: updateData,
    });

    return response.json({
      status: 'success',
      data: { workspace },
    });
  }

  async delete(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { id } = request.params;

    await this.deleteWorkspaceUseCase.execute({
      workspaceId: id,
      userId: request.user.id,
    });

    return response.status(204).send();
  }

  async inviteMember(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { id } = request.params;
    const { email, role } = request.body;

    if (!email) {
      throw AppError.badRequest('Email is required', 'MISSING_EMAIL');
    }

    const invitation = await this.inviteMemberUseCase.execute({
      data: {
        workspaceId: id,
        email,
        role,
        invitedById: request.user.id,
      },
    });

    return response.status(201).json({
      status: 'success',
      data: { invitation },
    });
  }

  async acceptInvitation(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { token } = request.params;

    const member = await this.acceptInvitationUseCase.execute({
      token,
      userId: request.user.id,
    });

    return response.json({
      status: 'success',
      data: { member },
    });
  }

  async removeMember(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { id, memberId } = request.params;

    await this.removeMemberUseCase.execute({
      workspaceId: id,
      memberId,
      requesterId: request.user.id,
    });

    return response.status(204).send();
  }

  async updateMember(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { id, memberId } = request.params;
    const updateData = request.body;

    const member = await this.updateMemberUseCase.execute({
      workspaceId: id,
      memberId,
      requesterId: request.user.id,
      data: updateData,
    });

    return response.json({
      status: 'success',
      data: { member },
    });
  }

  async listMembers(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { id } = request.params;

    const result = await this.listWorkspaceMembersUseCase.execute({
      workspaceId: id,
      userId: request.user.id,
    });

    return response.json({
      status: 'success',
      data: {
        members: result.members,
        invitations: result.invitations,
      },
    });
  }

  async uploadLogoAndExtractColors(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { id } = request.params;
    const file = request.file as MulterFile | undefined;

    if (!file) {
      throw AppError.badRequest('Logo file is required', 'MISSING_FILE');
    }

    const result = await this.uploadLogoAndExtractColorsUseCase.execute({
      workspaceId: id,
      userId: request.user.id,
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

  async listPendingInvitations(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const invitations = await this.listUserPendingInvitationsUseCase.execute(request.user.id);

    return response.json({
      status: 'success',
      data: { invitations },
    });
  }

  async deleteInvitation(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { id, invitationId } = request.params;

    await this.deleteInvitationUseCase.execute({
      workspaceId: id,
      invitationId,
      requesterId: request.user.id,
    });

    return response.status(204).send();
  }

  async listCompanies(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { id } = request.params;
    const result = await this.listWorkspaceCompaniesUseCase.execute({
      workspaceId: id,
      userId: request.user.id,
    });

    return response.json({
      status: 'success',
      data: { companies: result.companies },
    });
  }

  async replaceCompanies(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { id } = request.params;
    const { companyIds } = request.body;
    if (!Array.isArray(companyIds)) {
      throw AppError.badRequest('companyIds must be an array', 'INVALID_COMPANY_IDS');
    }

    const result = await this.replaceWorkspaceCompaniesUseCase.execute({
      workspaceId: id,
      userId: request.user.id,
      companyIds: companyIds.filter((value): value is string => typeof value === 'string'),
    });

    return response.json({
      status: 'success',
      data: { companies: result.companies },
    });
  }
}
