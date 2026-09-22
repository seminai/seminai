import type { Request, Response } from 'express';
import type { AcceptInvitationUseCase } from '../../../application/use-cases/workspace/AcceptInvitationUseCase';
import type { DeleteInvitationUseCase } from '../../../application/use-cases/workspace/DeleteInvitationUseCase';
import type { InviteMemberUseCase } from '../../../application/use-cases/workspace/InviteMemberUseCase';
import type { ListUserPendingInvitationsUseCase } from '../../../application/use-cases/workspace/ListUserPendingInvitationsUseCase';
import type { ListWorkspaceMembersUseCase } from '../../../application/use-cases/workspace/ListWorkspaceMembersUseCase';
import type { RemoveMemberUseCase } from '../../../application/use-cases/workspace/RemoveMemberUseCase';
import type { UpdateMemberUseCase } from '../../../application/use-cases/workspace/UpdateMemberUseCase';
import { AppError } from '../../../domain/errors/AppError';

export class WorkspaceMembershipController {
  constructor(
    private readonly inviteMemberUseCase: InviteMemberUseCase,
    private readonly acceptInvitationUseCase: AcceptInvitationUseCase,
    private readonly removeMemberUseCase: RemoveMemberUseCase,
    private readonly updateMemberUseCase: UpdateMemberUseCase,
    private readonly listWorkspaceMembersUseCase: ListWorkspaceMembersUseCase,
    private readonly listUserPendingInvitationsUseCase: ListUserPendingInvitationsUseCase,
    private readonly deleteInvitationUseCase: DeleteInvitationUseCase,
  ) {}

  async inviteMember(request: Request, response: Response): Promise<Response> {
    const user = this.requireUser(request);
    const { email, role } = request.body;
    if (!email) throw AppError.badRequest('Email is required', 'MISSING_EMAIL');
    const invitation = await this.inviteMemberUseCase.execute({
      data: {
        workspaceId: request.params.id,
        email,
        role,
        invitedById: user.id,
      },
    });
    return response.status(201).json({ status: 'success', data: { invitation } });
  }

  async acceptInvitation(request: Request, response: Response): Promise<Response> {
    const user = this.requireUser(request);
    const member = await this.acceptInvitationUseCase.execute({
      token: request.params.token,
      userId: user.id,
    });
    return response.json({ status: 'success', data: { member } });
  }

  async removeMember(request: Request, response: Response): Promise<Response> {
    const user = this.requireUser(request);
    await this.removeMemberUseCase.execute({
      workspaceId: request.params.id,
      memberId: request.params.memberId,
      requesterId: user.id,
    });
    return response.status(204).send();
  }

  async updateMember(request: Request, response: Response): Promise<Response> {
    const user = this.requireUser(request);
    const member = await this.updateMemberUseCase.execute({
      workspaceId: request.params.id,
      memberId: request.params.memberId,
      requesterId: user.id,
      data: request.body,
    });
    return response.json({ status: 'success', data: { member } });
  }

  async listMembers(request: Request, response: Response): Promise<Response> {
    const user = this.requireUser(request);
    const result = await this.listWorkspaceMembersUseCase.execute({
      workspaceId: request.params.id,
      userId: user.id,
    });
    return response.json({
      status: 'success',
      data: { members: result.members, invitations: result.invitations },
    });
  }

  async listPendingInvitations(request: Request, response: Response): Promise<Response> {
    const user = this.requireUser(request);
    const invitations = await this.listUserPendingInvitationsUseCase.execute(user.id);
    return response.json({ status: 'success', data: { invitations } });
  }

  async deleteInvitation(request: Request, response: Response): Promise<Response> {
    const user = this.requireUser(request);
    await this.deleteInvitationUseCase.execute({
      workspaceId: request.params.id,
      invitationId: request.params.invitationId,
      requesterId: user.id,
    });
    return response.status(204).send();
  }

  private requireUser(request: Request) {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    return request.user;
  }
}
