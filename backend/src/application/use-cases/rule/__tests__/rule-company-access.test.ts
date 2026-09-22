import { RuleCategory, RuleStatus, WorkspaceRole } from '@prisma/client';
import { AssignRuleToCompanyUseCase } from '../AssignRuleToCompanyUseCase';
import { UnassignRuleFromCompanyUseCase } from '../UnassignRuleFromCompanyUseCase';
import { ListCompanyRulesUseCase } from '../ListCompanyRulesUseCase';
import { ListRuleCompaniesUseCase } from '../ListRuleCompaniesUseCase';
import { Rule } from '../../../../domain/entities/Rule';
import { RuleOnCompany } from '../../../../domain/entities/RuleOnCompany';
import { Company } from '../../../../domain/entities/Company';
import { WorkspaceMember } from '../../../../domain/entities/WorkspaceMember';
import type { IRuleRepository } from '../../../../domain/repositories/IRuleRepository';
import type { IRuleOnCompanyRepository } from '../../../../domain/repositories/IRuleOnCompanyRepository';
import type { IWorkspaceMemberRepository } from '../../../../domain/repositories/IWorkspaceMemberRepository';
import type { ICompanyRepository } from '../../../../domain/repositories/ICompanyRepository';
import type { IWorkspaceRepository } from '../../../../domain/repositories/IWorkspaceRepository';
import { Workspace } from '../../../../domain/entities/Workspace';
import { WorkspaceKind } from '@prisma/client';

describe('rule company access use cases', () => {
  const rule = createRule();
  const member = new WorkspaceMember(
    'member-1',
    'workspace-1',
    'user-1',
    WorkspaceRole.OWNER,
    true,
    false,
    new Date(),
    new Date(),
  );
  const company = createCompany('company-1');

  it('denies assigning a rule to an inaccessible company', async () => {
    const ruleRepository = createRuleRepository(rule);
    const assignmentRepository = createAssignmentRepository();
    const workspaceMemberRepository = createWorkspaceMemberRepository(member);
    const companyRepository = createCompanyRepository(company, []);
    const useCase = new AssignRuleToCompanyUseCase(
      ruleRepository,
      assignmentRepository,
      createWorkspaceRepository(),
      workspaceMemberRepository,
      companyRepository,
    );

    await expect(
      useCase.execute({
        data: { ruleId: 'rule-1', companyId: 'company-1', assignedById: 'user-1' },
      }),
    ).rejects.toMatchObject({ code: 'NO_COMPANY_ACCESS' });
    expect(assignmentRepository.findByRuleAndCompany).not.toHaveBeenCalled();
  });

  it('allows assigning a public rule through a managed target workspace', async () => {
    const publicRule = createRule({ isPublic: true, workspaceId: 'source-workspace' });
    const targetMember = createMember('target-workspace');
    const ruleRepository = createRuleRepository(publicRule);
    const assignmentRepository = createAssignmentRepository();
    const workspaceMemberRepository = createWorkspaceMemberRepositoryByWorkspace({
      'target-workspace': targetMember,
    });
    const companyRepository = createCompanyRepository(company, [company]);
    const useCase = new AssignRuleToCompanyUseCase(
      ruleRepository,
      assignmentRepository,
      createWorkspaceRepository(),
      workspaceMemberRepository,
      companyRepository,
    );

    await useCase.execute({
      data: {
        ruleId: 'rule-1',
        companyId: 'company-1',
        workspaceId: 'target-workspace',
        assignedById: 'user-1',
      },
    });

    expect(assignmentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: 'rule-1', companyId: 'company-1' }),
    );
  });

  it('denies assigning a private rule from another workspace', async () => {
    const privateRule = createRule({ isPublic: false, workspaceId: 'source-workspace' });
    const useCase = new AssignRuleToCompanyUseCase(
      createRuleRepository(privateRule),
      createAssignmentRepository(),
      createWorkspaceRepository(),
      createWorkspaceMemberRepositoryByWorkspace({}),
      createCompanyRepository(company, [company]),
    );

    await expect(
      useCase.execute({
        data: {
          ruleId: 'rule-1',
          companyId: 'company-1',
          workspaceId: 'target-workspace',
          assignedById: 'user-1',
        },
      }),
    ).rejects.toMatchObject({ code: 'NOT_WORKSPACE_MEMBER' });
  });

  it('denies unassigning a rule from an inaccessible company', async () => {
    const ruleRepository = createRuleRepository(rule);
    const assignmentRepository = createAssignmentRepository();
    const workspaceMemberRepository = createWorkspaceMemberRepository(member);
    const companyRepository = createCompanyRepository(company, []);
    const useCase = new UnassignRuleFromCompanyUseCase(
      ruleRepository,
      assignmentRepository,
      workspaceMemberRepository,
      companyRepository,
    );

    await expect(
      useCase.execute({ ruleId: 'rule-1', companyId: 'company-1', userId: 'user-1' }),
    ).rejects.toMatchObject({ code: 'NO_COMPANY_ACCESS' });
    expect(assignmentRepository.findByRuleAndCompany).not.toHaveBeenCalled();
  });

  it('denies listing rules for an inaccessible company', async () => {
    const assignmentRepository = createAssignmentRepository();
    const companyRepository = createCompanyRepository(company, []);
    const useCase = new ListCompanyRulesUseCase(
      createRuleRepository(rule),
      assignmentRepository,
      companyRepository,
    );

    await expect(
      useCase.execute({ companyId: 'company-1', userId: 'user-1' }),
    ).rejects.toMatchObject({ code: 'NO_COMPANY_ACCESS' });
    expect(assignmentRepository.findByCompanyId).not.toHaveBeenCalled();
  });

  it('filters assigned companies to companies accessible by the user', async () => {
    const assignmentRepository = createAssignmentRepository([
      createAssignment('assignment-1', 'company-1'),
      createAssignment('assignment-2', 'company-2'),
    ]);
    const companyRepository = createCompanyRepository(company, [company]);
    const useCase = new ListRuleCompaniesUseCase(
      createRuleRepository(rule),
      assignmentRepository,
      createWorkspaceMemberRepository(member),
      companyRepository,
    );

    const actualResults = await useCase.execute({ ruleId: 'rule-1', userId: 'user-1' });

    expect(actualResults).toHaveLength(1);
    expect(actualResults[0].company.id).toBe('company-1');
  });

  it('adds applicability diagnostics to company rule listings', async () => {
    const assignmentRepository = createAssignmentRepository([
      createAssignment('assignment-1', 'company-1'),
    ]);
    const useCase = new ListCompanyRulesUseCase(
      createRuleRepository(rule),
      assignmentRepository,
      createCompanyRepository(company, [company]),
    );

    const actualResults = await useCase.execute({ companyId: 'company-1', userId: 'user-1' });

    expect(actualResults[0]).toMatchObject({
      appliesToDosage: true,
      appliesToCompliance: false,
      warnings: ['missing PDF', 'PDF not vectorized'],
      notApplicableReason: 'missing PDF; PDF not vectorized',
    });
  });
});
function createRule(
  overrides: { readonly isPublic?: boolean; readonly workspaceId?: string } = {},
): Rule {
  return new Rule(
    'rule-1',
    overrides.workspaceId ?? 'workspace-1',
    'Rule 1',
    'rule-1',
    null,
    RuleCategory.CUSTOM,
    RuleStatus.ACTIVE,
    {},
    null,
    null,
    null,
    null,
    null,
    '1.0',
    overrides.isPublic ?? false,
    false,
    'user-1',
    new Date(),
    new Date(),
  );
}
function createMember(workspaceId: string): WorkspaceMember {
  return new WorkspaceMember(
    `member-${workspaceId}`,
    workspaceId,
    'user-1',
    WorkspaceRole.OWNER,
    true,
    false,
    new Date(),
    new Date(),
  );
}
function createCompany(id: string): Company {
  return new Company(
    id,
    `Company ${id}`,
    `vat-${id}`,
    null,
    `fiscal-${id}`,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    new Date(),
    new Date(),
  );
}
function createAssignment(id: string, companyId: string): RuleOnCompany {
  return new RuleOnCompany(id, 'rule-1', companyId, true, 0, null, null, new Date(), 'user-1');
}
function createRuleRepository(rule: Rule): jest.Mocked<IRuleRepository> {
  return {
    findById: jest.fn().mockResolvedValue(rule),
  } as unknown as jest.Mocked<IRuleRepository>;
}
function createAssignmentRepository(
  assignments: RuleOnCompany[] = [],
): jest.Mocked<IRuleOnCompanyRepository> {
  return {
    findByRuleAndCompany: jest.fn().mockResolvedValue(null),
    findByRuleId: jest.fn().mockResolvedValue(assignments),
    findByCompanyId: jest.fn().mockResolvedValue(assignments),
    findActiveByCompanyId: jest.fn().mockResolvedValue(assignments),
    create: jest.fn(),
    deleteByRuleAndCompany: jest.fn(),
  } as unknown as jest.Mocked<IRuleOnCompanyRepository>;
}
function createWorkspaceMemberRepository(
  member: WorkspaceMember,
): jest.Mocked<IWorkspaceMemberRepository> {
  return {
    findByWorkspaceAndUser: jest.fn().mockResolvedValue(member),
  } as unknown as jest.Mocked<IWorkspaceMemberRepository>;
}
function createWorkspaceMemberRepositoryByWorkspace(
  members: Record<string, WorkspaceMember>,
): jest.Mocked<IWorkspaceMemberRepository> {
  return {
    findByWorkspaceAndUser: jest.fn((workspaceId: string) =>
      Promise.resolve(members[workspaceId] ?? null),
    ),
  } as unknown as jest.Mocked<IWorkspaceMemberRepository>;
}
function createCompanyRepository(
  company: Company,
  accessibleCompanies: Company[],
): jest.Mocked<ICompanyRepository> {
  return {
    findById: jest.fn().mockResolvedValue(company),
    findManyByUserId: jest.fn().mockResolvedValue(accessibleCompanies),
  } as unknown as jest.Mocked<ICompanyRepository>;
}
function createWorkspaceRepository(): jest.Mocked<IWorkspaceRepository> {
  return {
    findById: jest.fn().mockResolvedValue(
      Workspace.create({
        name: 'Test Workspace',
        slug: 'test-workspace',
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
      }),
    ),
  } as unknown as jest.Mocked<IWorkspaceRepository>;
}
