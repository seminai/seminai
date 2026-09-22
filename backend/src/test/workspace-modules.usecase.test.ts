import { UserRole, WorkspaceKind, WorkspaceModule } from '@prisma/client';
import { resolveEnabledModules } from '../application/services/workspace/resolveEnabledModules';
import { CreateWorkspaceUseCase } from '../application/use-cases/workspace/CreateWorkspaceUseCase';
import { Workspace } from '../domain/entities/Workspace';
import { ICompanyOnWorkspaceRepository } from '../domain/repositories/ICompanyOnWorkspaceRepository';
import { ICompanyRepository } from '../domain/repositories/ICompanyRepository';
import { IWorkspaceMemberRepository } from '../domain/repositories/IWorkspaceMemberRepository';
import { IWorkspaceRepository } from '../domain/repositories/IWorkspaceRepository';

describe('resolveEnabledModules', () => {
  it('always includes DCA when nothing is requested', () => {
    const actual = resolveEnabledModules(undefined, UserRole.GOD);
    expect(actual).toEqual([WorkspaceModule.DCA]);
  });

  it('grants LABELS to a privileged role that requests it', () => {
    const actual = resolveEnabledModules(
      [WorkspaceModule.DCA, WorkspaceModule.LABELS],
      UserRole.LABEL_MANAGER,
    );
    expect(actual).toEqual([WorkspaceModule.DCA, WorkspaceModule.LABELS]);
  });

  it('drops LABELS for a non-privileged role', () => {
    const actual = resolveEnabledModules([WorkspaceModule.LABELS], UserRole.BASIC);
    expect(actual).toEqual([WorkspaceModule.DCA]);
  });

  it('drops LABELS when the acting role is unknown', () => {
    const actual = resolveEnabledModules([WorkspaceModule.LABELS], undefined);
    expect(actual).toEqual([WorkspaceModule.DCA]);
  });

  it('never duplicates DCA when DCA is also requested', () => {
    const actual = resolveEnabledModules([WorkspaceModule.DCA], UserRole.ADMIN);
    expect(actual).toEqual([WorkspaceModule.DCA]);
  });
});

describe('CreateWorkspaceUseCase enabledModules gating', () => {
  function buildUseCase() {
    const mockWorkspaceRepository = {
      findBySlug: jest.fn().mockResolvedValue(null),
      create: jest.fn((workspace: Workspace) => Promise.resolve(workspace)),
    } as unknown as jest.Mocked<IWorkspaceRepository>;
    const mockWorkspaceMemberRepository = {
      create: jest.fn((member: unknown) => Promise.resolve(member)),
    } as unknown as jest.Mocked<IWorkspaceMemberRepository>;
    const mockCompanyOnWorkspaceRepository = {
      createMany: jest.fn(),
      findCompanyIdsByWorkspaceId: jest.fn(),
    } as unknown as jest.Mocked<ICompanyOnWorkspaceRepository>;
    const mockCompanyRepository = {
      findManyByUserId: jest.fn(),
    } as unknown as jest.Mocked<ICompanyRepository>;
    const useCase = new CreateWorkspaceUseCase(
      mockWorkspaceRepository,
      mockWorkspaceMemberRepository,
      mockCompanyOnWorkspaceRepository,
      mockCompanyRepository,
    );
    return { useCase, mockWorkspaceRepository };
  }

  it('persists [DCA] when a BASIC user requests LABELS', async () => {
    const { useCase, mockWorkspaceRepository } = buildUseCase();

    const result = await useCase.execute({
      data: {
        name: 'Studio Rossi',
        kind: WorkspaceKind.AGRICULTURAL,
        enabledModules: [WorkspaceModule.DCA, WorkspaceModule.LABELS],
      },
      userId: 'user-1',
      userRole: UserRole.BASIC,
    });

    expect(result.workspace.enabledModules).toEqual([WorkspaceModule.DCA]);
    const created = mockWorkspaceRepository.create.mock.calls[0][0] as Workspace;
    expect(created.enabledModules).toEqual([WorkspaceModule.DCA]);
  });

  it('persists [DCA, LABELS] when an ADMIN user requests LABELS', async () => {
    const { useCase, mockWorkspaceRepository } = buildUseCase();

    const result = await useCase.execute({
      data: {
        name: 'Studio Verdi',
        kind: WorkspaceKind.AGRICULTURAL,
        enabledModules: [WorkspaceModule.DCA, WorkspaceModule.LABELS],
      },
      userId: 'user-2',
      userRole: UserRole.ADMIN,
    });

    expect(result.workspace.enabledModules).toEqual([WorkspaceModule.DCA, WorkspaceModule.LABELS]);
    const created = mockWorkspaceRepository.create.mock.calls[0][0] as Workspace;
    expect(created.enabledModules).toEqual([WorkspaceModule.DCA, WorkspaceModule.LABELS]);
  });
});
