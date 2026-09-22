import { CompanyKind, WorkspaceKind, WorkspaceRole } from '@prisma/client';
import { assertCompanyKindMatchesWorkspace } from '../application/services/workspace/assert-company-kind-matches-workspace';
import { Workspace } from '../domain/entities/Workspace';
import { WorkspaceMember } from '../domain/entities/WorkspaceMember';
import { IWorkspaceMemberRepository } from '../domain/repositories/IWorkspaceMemberRepository';
import { IWorkspaceRepository } from '../domain/repositories/IWorkspaceRepository';

describe('assertCompanyKindMatchesWorkspace', () => {
  const workspaceId = 'ws-1';
  const userId = 'user-1';

  const agriculturalWorkspace = Workspace.create({
    name: 'Agricultural WS',
    slug: 'agricultural-ws',
    description: null,
    logoUrl: null,
    iconUrl: null,
    primaryColor: null,
    secondaryColor: null,
    accentColor: null,
    customCss: null,
    kind: WorkspaceKind.AGRICULTURAL,
    plan: 'FREE',
    isActive: true,
    maxMembers: 5,
    maxRules: 50,
  });

  let workspaceRepository: jest.Mocked<IWorkspaceRepository>;
  let workspaceMemberRepository: jest.Mocked<IWorkspaceMemberRepository>;

  beforeEach(() => {
    workspaceRepository = {
      findById: jest.fn().mockResolvedValue(agriculturalWorkspace),
    } as unknown as jest.Mocked<IWorkspaceRepository>;

    workspaceMemberRepository = {
      findByWorkspaceAndUser: jest.fn().mockResolvedValue(
        WorkspaceMember.create({
          workspaceId,
          userId,
          role: WorkspaceRole.ADMIN,
          canManageRules: true,
          canInviteMembers: false,
        }),
      ),
    } as unknown as jest.Mocked<IWorkspaceMemberRepository>;
  });

  it('returns workspace kind when company kind matches', async () => {
    const result = await assertCompanyKindMatchesWorkspace({
      workspaceId,
      companyKind: CompanyKind.AGRICULTURAL,
      userId,
      workspaceRepository,
      workspaceMemberRepository,
    });

    expect(result).toBe(WorkspaceKind.AGRICULTURAL);
  });

  it('throws 400 when company kind mismatches workspace kind', async () => {
    await expect(
      assertCompanyKindMatchesWorkspace({
        workspaceId,
        companyKind: CompanyKind.MANUFACTURING,
        userId,
        workspaceRepository,
        workspaceMemberRepository,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'COMPANY_KIND_WORKSPACE_MISMATCH',
    });
  });

  it('throws 404 when workspace is missing', async () => {
    workspaceRepository.findById.mockResolvedValue(null);

    await expect(
      assertCompanyKindMatchesWorkspace({
        workspaceId,
        companyKind: CompanyKind.AGRICULTURAL,
        userId,
        workspaceRepository,
        workspaceMemberRepository,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: 'WORKSPACE_NOT_FOUND',
    });
  });

  it('throws 403 when user is not a workspace member', async () => {
    workspaceMemberRepository.findByWorkspaceAndUser.mockResolvedValue(null);

    await expect(
      assertCompanyKindMatchesWorkspace({
        workspaceId,
        companyKind: CompanyKind.AGRICULTURAL,
        userId,
        workspaceRepository,
        workspaceMemberRepository,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'NOT_WORKSPACE_MEMBER',
    });
  });
});
