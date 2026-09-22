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
import { Workspace } from '../domain/entities/Workspace';
import { WorkspaceMember } from '../domain/entities/WorkspaceMember';
import { WorkspaceInvitation } from '../domain/entities/WorkspaceInvitation';
import { AppError } from '../domain/errors/AppError';
import { WorkspaceModule, WorkspacePlan, WorkspaceRole, WorkspaceKind } from '@prisma/client';

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

  describe('create', () => {
    it('should create a new workspace successfully', async () => {
      const inputWorkspaceData = {
        name: 'Studio Agronomico Test',
        kind: WorkspaceKind.AGRICULTURAL,
        description: 'Description test',
        primaryColor: '#2563eb',
      };

      mockRequest = {
        body: inputWorkspaceData,
        user: { id: 'user-123' },
      };

      const expectedWorkspace = new Workspace(
        'workspace-123',
        inputWorkspaceData.name,
        'studio-agronomico-test',
        inputWorkspaceData.description,
        null,
        null,
        '#2563eb',
        '#1e40af',
        '#3b82f6',
        null,
        WorkspaceKind.AGRICULTURAL,
        WorkspacePlan.FREE,
        true,
        5,
        50,
        new Date(),
        new Date(),
      );

      const expectedMember = new WorkspaceMember(
        'member-123',
        'workspace-123',
        'user-123',
        WorkspaceRole.OWNER,
        true,
        true,
        new Date(),
        new Date(),
      );

      mockCreateWorkspaceUseCase.execute.mockResolvedValue({
        workspace: expectedWorkspace,
        member: expectedMember,
      });

      await workspaceController.create(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: {
          workspace: expectedWorkspace,
          member: expectedMember,
        },
      });
    });

    it('should throw error when kind is missing', async () => {
      mockRequest = {
        body: { name: 'Test Workspace' },
        user: { id: 'user-123' },
      };

      await expect(
        workspaceController.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should throw error when name is missing', async () => {
      mockRequest = {
        body: {},
        user: { id: 'user-123' },
      };

      await expect(
        workspaceController.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should throw error when user is not authenticated', async () => {
      mockRequest = {
        body: { name: 'Test Workspace' },
        user: undefined,
      };

      await expect(
        workspaceController.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });

  describe('list', () => {
    it('should list workspaces for current user', async () => {
      mockRequest = {
        user: { id: 'user-123' },
      };

      const expectedWorkspaces = [
        new Workspace(
          'workspace-1',
          'Workspace 1',
          'workspace-1',
          null,
          null,
          null,
          '#2563eb',
          '#1e40af',
          '#3b82f6',
          null,
          WorkspaceKind.AGRICULTURAL,
          WorkspacePlan.FREE,
          true,
          5,
          50,
          new Date(),
          new Date(),
        ),
        new Workspace(
          'workspace-2',
          'Workspace 2',
          'workspace-2',
          null,
          null,
          null,
          '#2563eb',
          '#1e40af',
          '#3b82f6',
          null,
          WorkspaceKind.AGRICULTURAL,
          WorkspacePlan.PROFESSIONAL,
          true,
          25,
          100,
          new Date(),
          new Date(),
        ),
      ];

      mockListUserWorkspacesUseCase.execute.mockResolvedValue(expectedWorkspaces);

      await workspaceController.list(mockRequest as Request, mockResponse as Response);

      expect(mockListUserWorkspacesUseCase.execute).toHaveBeenCalledWith('user-123');
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { workspaces: expectedWorkspaces },
      });
    });
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
    });
  });

  describe('inviteMember', () => {
    it('should invite a member to workspace', async () => {
      mockRequest = {
        params: { id: 'workspace-123' },
        body: { email: 'newmember@test.com', role: 'MEMBER' },
        user: { id: 'user-123' },
      };

      const expectedInvitation = new WorkspaceInvitation(
        'invitation-123',
        'workspace-123',
        'newmember@test.com',
        WorkspaceRole.MEMBER,
        'token-abc',
        'user-123',
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        null,
        new Date(),
      );

      mockInviteMemberUseCase.execute.mockResolvedValue(expectedInvitation);

      await workspaceController.inviteMember(mockRequest as Request, mockResponse as Response);

      expect(mockInviteMemberUseCase.execute).toHaveBeenCalledWith({
        data: {
          workspaceId: 'workspace-123',
          email: 'newmember@test.com',
          role: 'MEMBER',
          invitedById: 'user-123',
        },
      });
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { invitation: expectedInvitation },
      });
    });

    it('should throw error when email is missing', async () => {
      mockRequest = {
        params: { id: 'workspace-123' },
        body: { role: 'MEMBER' },
        user: { id: 'user-123' },
      };

      await expect(
        workspaceController.inviteMember(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });

  describe('delete', () => {
    it('should delete workspace successfully', async () => {
      mockRequest = {
        params: { id: 'workspace-123' },
        user: { id: 'user-123' },
      };

      mockDeleteWorkspaceUseCase.execute.mockResolvedValue();

      await workspaceController.delete(mockRequest as Request, mockResponse as Response);

      expect(mockDeleteWorkspaceUseCase.execute).toHaveBeenCalledWith({
        workspaceId: 'workspace-123',
        userId: 'user-123',
      });
      expect(mockResponse.status).toHaveBeenCalledWith(204);
      expect(mockResponse.send).toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('should remove member from workspace', async () => {
      mockRequest = {
        params: { id: 'workspace-123', memberId: 'member-456' },
        user: { id: 'user-123' },
      };

      mockRemoveMemberUseCase.execute.mockResolvedValue();

      await workspaceController.removeMember(mockRequest as Request, mockResponse as Response);

      expect(mockRemoveMemberUseCase.execute).toHaveBeenCalledWith({
        workspaceId: 'workspace-123',
        memberId: 'member-456',
        requesterId: 'user-123',
      });
      expect(mockResponse.status).toHaveBeenCalledWith(204);
    });
  });
});

describe('Workspace Entity', () => {
  describe('generateSlug', () => {
    it('should generate slug from name', () => {
      const actualSlug = Workspace.generateSlug('Studio Agronomico Rossi');
      expect(actualSlug).toBe('studio-agronomico-rossi');
    });

    it('should handle accented characters', () => {
      const actualSlug = Workspace.generateSlug('Società Agricola Città');
      expect(actualSlug).toBe('societa-agricola-citta');
    });

    it('should handle special characters', () => {
      const actualSlug = Workspace.generateSlug('Test & Company (2024)');
      expect(actualSlug).toBe('test-company-2024');
    });
  });

  describe('canAddMember', () => {
    it('should return true when under limit', () => {
      const workspace = new Workspace(
        'id',
        'name',
        'slug',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        WorkspaceKind.AGRICULTURAL,
        WorkspacePlan.FREE,
        true,
        5,
        50,
        new Date(),
        new Date(),
      );

      expect(workspace.canAddMember(3)).toBe(true);
    });

    it('should return false when at limit', () => {
      const workspace = new Workspace(
        'id',
        'name',
        'slug',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        WorkspaceKind.AGRICULTURAL,
        WorkspacePlan.FREE,
        true,
        5,
        50,
        new Date(),
        new Date(),
      );

      expect(workspace.canAddMember(5)).toBe(false);
    });
  });

  describe('hasEnterpriseFeatures', () => {
    it('should return true for enterprise plan', () => {
      const workspace = new Workspace(
        'id',
        'name',
        'slug',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        WorkspaceKind.AGRICULTURAL,
        WorkspacePlan.ENTERPRISE,
        true,
        100,
        500,
        new Date(),
        new Date(),
      );

      expect(workspace.hasEnterpriseFeatures()).toBe(true);
    });

    it('should return false for free plan', () => {
      const workspace = new Workspace(
        'id',
        'name',
        'slug',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        WorkspaceKind.AGRICULTURAL,
        WorkspacePlan.FREE,
        true,
        5,
        50,
        new Date(),
        new Date(),
      );

      expect(workspace.hasEnterpriseFeatures()).toBe(false);
    });
  });
});

describe('WorkspaceMember Entity', () => {
  describe('isOwner', () => {
    it('should return true for owner role', () => {
      const member = new WorkspaceMember(
        'id',
        'workspace-id',
        'user-id',
        WorkspaceRole.OWNER,
        true,
        true,
        new Date(),
        new Date(),
      );

      expect(member.isOwner()).toBe(true);
    });

    it('should return false for admin role', () => {
      const member = new WorkspaceMember(
        'id',
        'workspace-id',
        'user-id',
        WorkspaceRole.ADMIN,
        true,
        true,
        new Date(),
        new Date(),
      );

      expect(member.isOwner()).toBe(false);
    });
  });

  describe('isAdmin', () => {
    it('should return true for owner role', () => {
      const member = new WorkspaceMember(
        'id',
        'workspace-id',
        'user-id',
        WorkspaceRole.OWNER,
        true,
        true,
        new Date(),
        new Date(),
      );

      expect(member.isAdmin()).toBe(true);
    });

    it('should return true for admin role', () => {
      const member = new WorkspaceMember(
        'id',
        'workspace-id',
        'user-id',
        WorkspaceRole.ADMIN,
        true,
        true,
        new Date(),
        new Date(),
      );

      expect(member.isAdmin()).toBe(true);
    });

    it('should return false for member role', () => {
      const member = new WorkspaceMember(
        'id',
        'workspace-id',
        'user-id',
        WorkspaceRole.MEMBER,
        false,
        false,
        new Date(),
        new Date(),
      );

      expect(member.isAdmin()).toBe(false);
    });
  });

  describe('hasRuleManagementPermission', () => {
    it('should return true for admin', () => {
      const member = new WorkspaceMember(
        'id',
        'workspace-id',
        'user-id',
        WorkspaceRole.ADMIN,
        false,
        false,
        new Date(),
        new Date(),
      );

      expect(member.hasRuleManagementPermission()).toBe(true);
    });

    it('should return true when canManageRules is true', () => {
      const member = new WorkspaceMember(
        'id',
        'workspace-id',
        'user-id',
        WorkspaceRole.MEMBER,
        true,
        false,
        new Date(),
        new Date(),
      );

      expect(member.hasRuleManagementPermission()).toBe(true);
    });

    it('should return false for regular member without permission', () => {
      const member = new WorkspaceMember(
        'id',
        'workspace-id',
        'user-id',
        WorkspaceRole.MEMBER,
        false,
        false,
        new Date(),
        new Date(),
      );

      expect(member.hasRuleManagementPermission()).toBe(false);
    });
  });
});

describe('WorkspaceInvitation Entity', () => {
  describe('isExpired', () => {
    it('should return true when expired', () => {
      const invitation = new WorkspaceInvitation(
        'id',
        'workspace-id',
        'test@test.com',
        WorkspaceRole.MEMBER,
        'token',
        'inviter-id',
        new Date(Date.now() - 1000), // Past date
        null,
        new Date(),
      );

      expect(invitation.isExpired()).toBe(true);
    });

    it('should return false when not expired', () => {
      const invitation = new WorkspaceInvitation(
        'id',
        'workspace-id',
        'test@test.com',
        WorkspaceRole.MEMBER,
        'token',
        'inviter-id',
        new Date(Date.now() + 1000 * 60 * 60), // Future date
        null,
        new Date(),
      );

      expect(invitation.isExpired()).toBe(false);
    });
  });

  describe('isAccepted', () => {
    it('should return true when accepted', () => {
      const invitation = new WorkspaceInvitation(
        'id',
        'workspace-id',
        'test@test.com',
        WorkspaceRole.MEMBER,
        'token',
        'inviter-id',
        new Date(Date.now() + 1000 * 60 * 60),
        new Date(),
        new Date(),
      );

      expect(invitation.isAccepted()).toBe(true);
    });

    it('should return false when not accepted', () => {
      const invitation = new WorkspaceInvitation(
        'id',
        'workspace-id',
        'test@test.com',
        WorkspaceRole.MEMBER,
        'token',
        'inviter-id',
        new Date(Date.now() + 1000 * 60 * 60),
        null,
        new Date(),
      );

      expect(invitation.isAccepted()).toBe(false);
    });
  });

  describe('isValid', () => {
    it('should return true when not expired and not accepted', () => {
      const invitation = new WorkspaceInvitation(
        'id',
        'workspace-id',
        'test@test.com',
        WorkspaceRole.MEMBER,
        'token',
        'inviter-id',
        new Date(Date.now() + 1000 * 60 * 60),
        null,
        new Date(),
      );

      expect(invitation.isValid()).toBe(true);
    });

    it('should return false when expired', () => {
      const invitation = new WorkspaceInvitation(
        'id',
        'workspace-id',
        'test@test.com',
        WorkspaceRole.MEMBER,
        'token',
        'inviter-id',
        new Date(Date.now() - 1000),
        null,
        new Date(),
      );

      expect(invitation.isValid()).toBe(false);
    });

    it('should return false when already accepted', () => {
      const invitation = new WorkspaceInvitation(
        'id',
        'workspace-id',
        'test@test.com',
        WorkspaceRole.MEMBER,
        'token',
        'inviter-id',
        new Date(Date.now() + 1000 * 60 * 60),
        new Date(),
        new Date(),
      );

      expect(invitation.isValid()).toBe(false);
    });
  });
});
