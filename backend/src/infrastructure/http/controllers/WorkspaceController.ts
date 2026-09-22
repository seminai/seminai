import type { Request, Response } from 'express';
import type { CreateWorkspaceUseCase } from '../../../application/use-cases/workspace/CreateWorkspaceUseCase';
import type { GetWorkspaceUseCase } from '../../../application/use-cases/workspace/GetWorkspaceUseCase';
import type { ListUserWorkspacesUseCase } from '../../../application/use-cases/workspace/ListUserWorkspacesUseCase';
import type { UpdateWorkspaceUseCase } from '../../../application/use-cases/workspace/UpdateWorkspaceUseCase';
import type { DeleteWorkspaceUseCase } from '../../../application/use-cases/workspace/DeleteWorkspaceUseCase';
import type { InviteMemberUseCase } from '../../../application/use-cases/workspace/InviteMemberUseCase';
import type { AcceptInvitationUseCase } from '../../../application/use-cases/workspace/AcceptInvitationUseCase';
import type { RemoveMemberUseCase } from '../../../application/use-cases/workspace/RemoveMemberUseCase';
import type { UpdateMemberUseCase } from '../../../application/use-cases/workspace/UpdateMemberUseCase';
import type { ListWorkspaceMembersUseCase } from '../../../application/use-cases/workspace/ListWorkspaceMembersUseCase';
import type { UploadLogoAndExtractColorsUseCase } from '../../../application/use-cases/workspace/UploadLogoAndExtractColorsUseCase';
import type { ListUserPendingInvitationsUseCase } from '../../../application/use-cases/workspace/ListUserPendingInvitationsUseCase';
import type { DeleteInvitationUseCase } from '../../../application/use-cases/workspace/DeleteInvitationUseCase';
import type { ListWorkspaceCompaniesUseCase } from '../../../application/use-cases/workspace/ListWorkspaceCompaniesUseCase';
import type { ReplaceWorkspaceCompaniesUseCase } from '../../../application/use-cases/workspace/ReplaceWorkspaceCompaniesUseCase';
import { WorkspaceCoreController } from './WorkspaceCoreController';
import { WorkspaceMembershipController } from './WorkspaceMembershipController';

export class WorkspaceController {
  private readonly core: WorkspaceCoreController;
  private readonly membership: WorkspaceMembershipController;

  constructor(
    createWorkspaceUseCase: CreateWorkspaceUseCase,
    getWorkspaceUseCase: GetWorkspaceUseCase,
    listUserWorkspacesUseCase: ListUserWorkspacesUseCase,
    updateWorkspaceUseCase: UpdateWorkspaceUseCase,
    deleteWorkspaceUseCase: DeleteWorkspaceUseCase,
    inviteMemberUseCase: InviteMemberUseCase,
    acceptInvitationUseCase: AcceptInvitationUseCase,
    removeMemberUseCase: RemoveMemberUseCase,
    updateMemberUseCase: UpdateMemberUseCase,
    listWorkspaceMembersUseCase: ListWorkspaceMembersUseCase,
    uploadLogoAndExtractColorsUseCase: UploadLogoAndExtractColorsUseCase,
    listUserPendingInvitationsUseCase: ListUserPendingInvitationsUseCase,
    deleteInvitationUseCase: DeleteInvitationUseCase,
    listWorkspaceCompaniesUseCase: ListWorkspaceCompaniesUseCase,
    replaceWorkspaceCompaniesUseCase: ReplaceWorkspaceCompaniesUseCase,
  ) {
    this.core = new WorkspaceCoreController(
      createWorkspaceUseCase,
      getWorkspaceUseCase,
      listUserWorkspacesUseCase,
      updateWorkspaceUseCase,
      deleteWorkspaceUseCase,
      uploadLogoAndExtractColorsUseCase,
      listWorkspaceCompaniesUseCase,
      replaceWorkspaceCompaniesUseCase,
    );
    this.membership = new WorkspaceMembershipController(
      inviteMemberUseCase,
      acceptInvitationUseCase,
      removeMemberUseCase,
      updateMemberUseCase,
      listWorkspaceMembersUseCase,
      listUserPendingInvitationsUseCase,
      deleteInvitationUseCase,
    );
  }

  create(request: Request, response: Response) {
    return this.core.create(request, response);
  }
  findById(request: Request, response: Response) {
    return this.core.findById(request, response);
  }
  list(request: Request, response: Response) {
    return this.core.list(request, response);
  }
  update(request: Request, response: Response) {
    return this.core.update(request, response);
  }
  delete(request: Request, response: Response) {
    return this.core.delete(request, response);
  }
  uploadLogoAndExtractColors(request: Request, response: Response) {
    return this.core.uploadLogoAndExtractColors(request, response);
  }
  listCompanies(request: Request, response: Response) {
    return this.core.listCompanies(request, response);
  }
  replaceCompanies(request: Request, response: Response) {
    return this.core.replaceCompanies(request, response);
  }
  inviteMember(request: Request, response: Response) {
    return this.membership.inviteMember(request, response);
  }
  acceptInvitation(request: Request, response: Response) {
    return this.membership.acceptInvitation(request, response);
  }
  removeMember(request: Request, response: Response) {
    return this.membership.removeMember(request, response);
  }
  updateMember(request: Request, response: Response) {
    return this.membership.updateMember(request, response);
  }
  listMembers(request: Request, response: Response) {
    return this.membership.listMembers(request, response);
  }
  listPendingInvitations(request: Request, response: Response) {
    return this.membership.listPendingInvitations(request, response);
  }
  deleteInvitation(request: Request, response: Response) {
    return this.membership.deleteInvitation(request, response);
  }
}
