import { Request, Response } from 'express';
import { WorkspaceController } from '../infrastructure/http/controllers/WorkspaceController';
import { CreateWorkspaceUseCase } from '../application/use-cases/workspace/CreateWorkspaceUseCase';
import { GetWorkspaceUseCase } from '../application/use-cases/workspace/GetWorkspaceUseCase';
import { ListUserWorkspacesUseCase } from '../application/use-cases/workspace/ListUserWorkspacesUseCase';
import { UpdateWorkspaceUseCase } from '../application/use-cases/workspace/UpdateWorkspaceUseCase';
import { DeleteWorkspaceUseCase } from '../application/use-cases/workspace/DeleteWorkspaceUseCase';
import { InviteMemberUseCase } from '../application/use-cases/workspace/InviteMemberUseCase';
import { AcceptInvitationUseCase } from '../application/use-cases/workspace/AcceptInvitationUseCase';
import { RemoveMemberUseCase } from '../application/use-cases/workspace/RemoveMemberUseCase';
import { UpdateMemberUseCase } from '../application/use-cases/workspace/UpdateMemberUseCase';
import { ListWorkspaceMembersUseCase } from '../application/use-cases/workspace/ListWorkspaceMembersUseCase';
import { UploadLogoAndExtractColorsUseCase } from '../application/use-cases/workspace/UploadLogoAndExtractColorsUseCase';
import { ListUserPendingInvitationsUseCase } from '../application/use-cases/workspace/ListUserPendingInvitationsUseCase';
import { DeleteInvitationUseCase } from '../application/use-cases/workspace/DeleteInvitationUseCase';
import { ListWorkspaceCompaniesUseCase } from '../application/use-cases/workspace/ListWorkspaceCompaniesUseCase';
import { ReplaceWorkspaceCompaniesUseCase } from '../application/use-cases/workspace/ReplaceWorkspaceCompaniesUseCase';
import { WorkspaceModule, WorkspacePlan, WorkspaceKind } from '@prisma/client';
describe('WorkspaceController', () => {
  let workspaceController: WorkspaceController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockCreateWorkspaceUseCase: jest.Mocked<CreateWorkspaceUseCase>;
  let mockGetWorkspaceUseCase: jest.Mocked<GetWorkspaceUseCase>;
  let mockListUserWorkspacesUseCase: jest.Mocked<ListUserWorkspacesUseCase>;
  let mockUpdateWorkspaceUseCase: jest.Mocked<UpdateWorkspaceUseCase>;
  let mockDeleteWorkspaceUseCase: jest.Mocked<DeleteWorkspaceUseCase>;
  let mockInviteMemberUseCase: jest.Mocked<InviteMemberUseCase>;
  let mockAcceptInvitationUseCase: jest.Mocked<AcceptInvitationUseCase>;
  let mockRemoveMemberUseCase: jest.Mocked<RemoveMemberUseCase>;
  let mockUpdateMemberUseCase: jest.Mocked<UpdateMemberUseCase>;
  let mockListWorkspaceMembersUseCase: jest.Mocked<ListWorkspaceMembersUseCase>;
  let mockUploadLogoAndExtractColorsUseCase: jest.Mocked<UploadLogoAndExtractColorsUseCase>;
  let mockListUserPendingInvitationsUseCase: jest.Mocked<ListUserPendingInvitationsUseCase>;
  let mockDeleteInvitationUseCase: jest.Mocked<DeleteInvitationUseCase>;
  let mockListWorkspaceCompaniesUseCase: jest.Mocked<ListWorkspaceCompaniesUseCase>;
  let mockReplaceWorkspaceCompaniesUseCase: jest.Mocked<ReplaceWorkspaceCompaniesUseCase>;

  beforeEach(() => {
    mockCreateWorkspaceUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateWorkspaceUseCase>;

    mockGetWorkspaceUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetWorkspaceUseCase>;

    mockListUserWorkspacesUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListUserWorkspacesUseCase>;

    mockUpdateWorkspaceUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateWorkspaceUseCase>;

    mockDeleteWorkspaceUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<DeleteWorkspaceUseCase>;

    mockInviteMemberUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<InviteMemberUseCase>;

    mockAcceptInvitationUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<AcceptInvitationUseCase>;

    mockRemoveMemberUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<RemoveMemberUseCase>;

    mockUpdateMemberUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateMemberUseCase>;

    mockListWorkspaceMembersUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListWorkspaceMembersUseCase>;

    mockUploadLogoAndExtractColorsUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UploadLogoAndExtractColorsUseCase>;

    mockListUserPendingInvitationsUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListUserPendingInvitationsUseCase>;

    mockDeleteInvitationUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<DeleteInvitationUseCase>;

    mockListWorkspaceCompaniesUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListWorkspaceCompaniesUseCase>;

    mockReplaceWorkspaceCompaniesUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ReplaceWorkspaceCompaniesUseCase>;

    workspaceController = new WorkspaceController(
      mockCreateWorkspaceUseCase,
      mockGetWorkspaceUseCase,
      mockListUserWorkspacesUseCase,
      mockUpdateWorkspaceUseCase,
      mockDeleteWorkspaceUseCase,
      mockInviteMemberUseCase,
      mockAcceptInvitationUseCase,
      mockRemoveMemberUseCase,
      mockUpdateMemberUseCase,
      mockListWorkspaceMembersUseCase,
      mockUploadLogoAndExtractColorsUseCase,
      mockListUserPendingInvitationsUseCase,
      mockDeleteInvitationUseCase,
      mockListWorkspaceCompaniesUseCase,
      mockReplaceWorkspaceCompaniesUseCase,
    );

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn(),
    } as unknown as Partial<Response>;
  });

  describe('findById', () => {
    it('should find workspace by id', async () => {
      mockRequest = {
        params: { id: 'workspace-123' },
        user: { id: 'user-123' },
      };

      const expectedWorkspace = {
        id: 'workspace-123',
        name: 'Test Workspace',
        slug: 'test-workspace',
        description: null,
        logoUrl: null,
        iconUrl: null,
        primaryColor: '#2563eb',
        secondaryColor: '#1e40af',
        accentColor: '#3b82f6',
        kind: WorkspaceKind.AGRICULTURAL,
        plan: WorkspacePlan.FREE,
        isActive: true,
        maxMembers: 5,
        maxRules: 50,
        enabledModules: [WorkspaceModule.DCA],
        createdAt: new Date(),
        updatedAt: new Date(),
        membersCount: 3,
        rulesCount: 10,
      };

      mockGetWorkspaceUseCase.execute.mockResolvedValue(expectedWorkspace);

      await workspaceController.findById(mockRequest as Request, mockResponse as Response);

      expect(mockGetWorkspaceUseCase.execute).toHaveBeenCalledWith({
        workspaceId: 'workspace-123',
        userId: 'user-123',
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { workspace: expectedWorkspace },
      });
    });});});
