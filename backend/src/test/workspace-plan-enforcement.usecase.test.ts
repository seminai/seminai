import { WorkspaceKind, WorkspacePlan, WorkspaceRole, RuleCategory } from '@prisma/client';
import { Workspace } from '../domain/entities/Workspace';
import { WorkspaceMember } from '../domain/entities/WorkspaceMember';
import { WorkspaceInvitation } from '../domain/entities/WorkspaceInvitation';
import { User } from '../domain/entities/User';
import { WorkspacePlanLimitsPolicy } from '../application/services/workspace/WorkspacePlanLimitsPolicy';
import { UpdateWorkspaceUseCase } from '../application/use-cases/workspace/UpdateWorkspaceUseCase';
import { AcceptInvitationUseCase } from '../application/use-cases/workspace/AcceptInvitationUseCase';
import { CreateRuleUseCase } from '../application/use-cases/rule/CreateRuleUseCase';

describe('WorkspacePlanLimitsPolicy', () => {
  it('should return limits for free plan', () => {
    const actualLimits = WorkspacePlanLimitsPolicy.getLimits(WorkspacePlan.FREE);
    expect(actualLimits).toEqual({ maxMembers: 5, maxRules: 50 });
  });

  it('should return limits for professional plan', () => {
    const actualLimits = WorkspacePlanLimitsPolicy.getLimits(WorkspacePlan.PROFESSIONAL);
    expect(actualLimits).toEqual({ maxMembers: 25, maxRules: 100 });
  });

  it('should detect downgrade correctly', () => {
    expect(
      WorkspacePlanLimitsPolicy.isDowngrade(WorkspacePlan.ENTERPRISE, WorkspacePlan.FREE),
    ).toBe(true);
    expect(
      WorkspacePlanLimitsPolicy.isDowngrade(WorkspacePlan.PROFESSIONAL, WorkspacePlan.ENTERPRISE),
    ).toBe(false);
  });
});

describe('Workspace plan hard-block enforcement', () => {
  it('should reject workspace plan downgrade when usage exceeds next limits', async () => {
    const mockWorkspaceRepository = {
      findById: jest.fn(),
      findBySlug: jest.fn(),
      countMembers: jest.fn(),
      countRules: jest.fn(),
      update: jest.fn(),
    } as any;
    const mockWorkspaceMemberRepository = {
      findByWorkspaceAndUser: jest.fn(),
    } as any;
    const useCase = new UpdateWorkspaceUseCase(
      mockWorkspaceRepository,
      mockWorkspaceMemberRepository,
    );
    const workspace = new Workspace(
      'workspace-1',
      'Workspace',
      'workspace',
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
    );
    const adminMember = new WorkspaceMember(
      'member-1',
      'workspace-1',
      'user-1',
      WorkspaceRole.OWNER,
      true,
      true,
      new Date(),
      new Date(),
    );
    mockWorkspaceMemberRepository.findByWorkspaceAndUser.mockResolvedValue(adminMember);
    mockWorkspaceRepository.findById.mockResolvedValue(workspace);
    mockWorkspaceRepository.countMembers.mockResolvedValue(6);
    mockWorkspaceRepository.countRules.mockResolvedValue(40);

    await expect(
      useCase.execute({
        workspaceId: 'workspace-1',
        userId: 'user-1',
        data: { plan: WorkspacePlan.FREE },
      }),
    ).rejects.toMatchObject({ code: 'PLAN_DOWNGRADE_LIMIT_EXCEEDED' });
  });

  it('should reject invitation acceptance when workspace member limit is reached', async () => {
    const mockWorkspaceRepository = {
      findById: jest.fn(),
      countMembers: jest.fn(),
    } as any;
    const mockWorkspaceMemberRepository = {
      findByWorkspaceAndUser: jest.fn(),
      create: jest.fn(),
    } as any;
    const mockWorkspaceInvitationRepository = {
      findByToken: jest.fn(),
      update: jest.fn(),
    } as any;
    const mockUserRepository = {
      findById: jest.fn(),
    } as any;
    const useCase = new AcceptInvitationUseCase(
      mockWorkspaceRepository,
      mockWorkspaceMemberRepository,
      mockWorkspaceInvitationRepository,
      mockUserRepository,
    );
    const invitation = new WorkspaceInvitation(
      'invitation-1',
      'workspace-1',
      'member@test.com',
      WorkspaceRole.MEMBER,
      'token-1',
      'owner-1',
      new Date(Date.now() + 60_000),
      null,
      new Date(),
    );
    const user = User.create({
      email: 'member@test.com',
      name: 'Member',
      surname: null,
      fiscalCode: null,
      companyName: null,
      vatNumber: null,
      phoneNumber: null,
      address: null,
      profilePictureUrl: null,
      role: 'BASIC',
      credits: 0,
    });
    const workspace = new Workspace(
      'workspace-1',
      'Workspace',
      'workspace',
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
    );
    mockWorkspaceInvitationRepository.findByToken.mockResolvedValue(invitation);
    mockUserRepository.findById.mockResolvedValue(user);
    mockWorkspaceMemberRepository.findByWorkspaceAndUser.mockResolvedValue(null);
    mockWorkspaceRepository.findById.mockResolvedValue(workspace);
    mockWorkspaceRepository.countMembers.mockResolvedValue(5);

    await expect(useCase.execute({ token: 'token-1', userId: user.id })).rejects.toMatchObject({
      code: 'MEMBER_LIMIT_REACHED',
    });
  });

  it('should reject rule creation when workspace rule limit is reached', async () => {
    const mockRuleRepository = {
      findBySlug: jest.fn(),
      create: jest.fn(),
    } as any;
    const mockWorkspaceRepository = {
      findById: jest.fn(),
      countRules: jest.fn(),
    } as any;
    const mockWorkspaceMemberRepository = {
      findByWorkspaceAndUser: jest.fn(),
    } as any;
    const useCase = new CreateRuleUseCase(
      mockRuleRepository,
      mockWorkspaceRepository,
      mockWorkspaceMemberRepository,
    );
    const member = new WorkspaceMember(
      'member-1',
      'workspace-1',
      'user-1',
      WorkspaceRole.OWNER,
      true,
      true,
      new Date(),
      new Date(),
    );
    const workspace = new Workspace(
      'workspace-1',
      'Workspace',
      'workspace',
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
    );
    mockWorkspaceMemberRepository.findByWorkspaceAndUser.mockResolvedValue(member);
    mockWorkspaceRepository.findById.mockResolvedValue(workspace);
    mockWorkspaceRepository.countRules.mockResolvedValue(50);

    await expect(
      useCase.execute({
        data: {
          workspaceId: 'workspace-1',
          createdById: 'user-1',
          name: 'Rule 1',
          category: RuleCategory.DISCIPLINARE,
          content: {},
        },
      }),
    ).rejects.toMatchObject({ code: 'RULE_LIMIT_REACHED' });
  });
});
