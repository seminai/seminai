/**
 * Integration test: cross-tenant authorization gate on workspace-rule tools
 * (PR-B of P2).
 *
 * Verifies that the 4 workspace-rule tools reject a caller who is not a
 * member of the target workspace, BEFORE any DB write or use case runs.
 * The error must surface in the JSON output (tools catch and serialize).
 *
 * Run:
 *   npm run test:int:fast -- --testPathPattern workspace-rule-cross-tenant
 */

import { createTestUser, deleteTestUser, prisma } from './helpers';
import type { ITestUser } from './helpers';
import { createCreateWorkspaceRuleTool } from '../infrastructure/services/agents/dosage_agent_react/tools/create-workspace-rule.tool';
import { createListWorkspaceRulesTool } from '../infrastructure/services/agents/dosage_agent_react/tools/list-workspace-rules.tool';
import { createUpdateWorkspaceRuleTool } from '../infrastructure/services/agents/dosage_agent_react/tools/update-workspace-rule.tool';
import { createArchiveWorkspaceRuleTool } from '../infrastructure/services/agents/dosage_agent_react/tools/archive-workspace-rule.tool';

jest.setTimeout(60_000);

let testUser: ITestUser;
let foreignWorkspaceId: string;
let foreignRuleId: string;

const FOREIGN_ERROR = /Workspace non trovato o non autorizzato per questo utente/;

beforeAll(async () => {
  testUser = await createTestUser();

  const unique = String(Date.now());
  const workspace = await prisma.workspace.create({
    data: {
      name: `Foreign Tenant Workspace ${unique}`,
      slug: `foreign-tenant-ws-${unique}`,
    },
  });
  foreignWorkspaceId = workspace.id;

  // createdById is required by the schema but irrelevant to membership checks.
  // Using the test user satisfies the FK without granting workspace membership.
  const rule = await prisma.rule.create({
    data: {
      workspaceId: foreignWorkspaceId,
      name: 'Foreign Rule',
      slug: `foreign-rule-${unique}`,
      category: 'STANDARD',
      content: {},
      createdById: testUser.id,
    },
  });
  foreignRuleId = rule.id;
});

afterAll(async () => {
  // The test user is NOT a member of the foreign workspace, so the standard
  // helper cleanup does not touch these rows. Tear them down manually.
  await prisma.rule.deleteMany({ where: { workspaceId: foreignWorkspaceId } });
  await prisma.workspaceMember.deleteMany({ where: { workspaceId: foreignWorkspaceId } });
  await prisma.workspace.delete({ where: { id: foreignWorkspaceId } }).catch(() => undefined);
  await deleteTestUser();
});

describe('workspace-rule tools — cross-tenant authorization (integration)', () => {
  it('create_workspace_rule: rejects foreign workspaceId and creates no rule', async () => {
    const before = await prisma.rule.count({ where: { workspaceId: foreignWorkspaceId } });

    const tool = createCreateWorkspaceRuleTool('thread-test', testUser.id);
    const raw = await tool.func({
      workspaceId: foreignWorkspaceId,
      name: 'Should Not Be Created',
      category: 'STANDARD',
      content: {},
      uploadPdfFromChat: false,
    });
    const out = JSON.parse(raw as string);

    expect(out.error).toMatch(FOREIGN_ERROR);
    const after = await prisma.rule.count({ where: { workspaceId: foreignWorkspaceId } });
    expect(after).toBe(before);
  });

  it('list_workspace_rules: rejects foreign workspaceId', async () => {
    const tool = createListWorkspaceRulesTool(testUser.id);
    const raw = await tool.func({ workspaceId: foreignWorkspaceId });
    const out = JSON.parse(raw as string);

    expect(out.error).toMatch(FOREIGN_ERROR);
    expect(out.rules).toBeUndefined();
  });

  it('update_workspace_rule: rejects when ruleId belongs to foreign workspace', async () => {
    const before = await prisma.rule.findUnique({ where: { id: foreignRuleId } });

    const tool = createUpdateWorkspaceRuleTool('thread-test', testUser.id);
    const raw = await tool.func({
      ruleId: foreignRuleId,
      name: 'Hijacked Name',
      replacePdfFromChat: false,
    });
    const out = JSON.parse(raw as string);

    expect(out.error).toMatch(FOREIGN_ERROR);
    const after = await prisma.rule.findUnique({ where: { id: foreignRuleId } });
    expect(after?.name).toBe(before?.name); // unchanged
  });

  it('archive_workspace_rule: rejects when ruleId belongs to foreign workspace', async () => {
    const before = await prisma.rule.findUnique({ where: { id: foreignRuleId } });

    const tool = createArchiveWorkspaceRuleTool(testUser.id);
    const raw = await tool.func({ ruleId: foreignRuleId });
    const out = JSON.parse(raw as string);

    expect(out.error).toMatch(FOREIGN_ERROR);
    const after = await prisma.rule.findUnique({ where: { id: foreignRuleId } });
    expect(after?.status).toBe(before?.status); // unchanged (not flipped to DRAFT)
  });
});
