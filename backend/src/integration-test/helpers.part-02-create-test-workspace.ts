import type { WorkspacePlan } from '@prisma/client';
import { WorkspaceKind } from '@prisma/client';
import { PrismaWorkspaceRepository } from '../infrastructure/repositories/PrismaWorkspaceRepository';
import { PrismaWorkspaceMemberRepository } from '../infrastructure/repositories/PrismaWorkspaceMemberRepository';
import { PrismaCompanyRepository } from '../infrastructure/repositories/PrismaCompanyRepository';
import { PrismaCompanyOnWorkspaceRepository } from '../infrastructure/repositories/PrismaCompanyOnWorkspaceRepository';
import { CreateWorkspaceUseCase } from '../application/use-cases/workspace/CreateWorkspaceUseCase';
import type { Rule as PrismaRule, RuleCategory } from '@prisma/client';
import { PrismaRuleRepository } from '../infrastructure/repositories/PrismaRuleRepository';
import { CreateRuleUseCase } from '../application/use-cases/rule/CreateRuleUseCase';
import type { Chat as PrismaChat, ChatCategory, AgentMemory as PrismaAgentMemory, AgentMemoryType, AgentTask as PrismaAgentTask, OuterLoopTrigger as PrismaOuterLoopTrigger } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { ITestWorkspace, prisma } from './helpers.part-01-prisma';

export async function createTestWorkspace(params: {
  userId: string;
  name?: string;
  plan?: WorkspacePlan;
  kind?: WorkspaceKind;
}): Promise<ITestWorkspace> {
  const workspaceRepository = new PrismaWorkspaceRepository(prisma);
  const memberRepository = new PrismaWorkspaceMemberRepository(prisma);
  const companyRepository = new PrismaCompanyRepository(prisma);
  const companyOnWorkspaceRepository = new PrismaCompanyOnWorkspaceRepository(prisma);
  const createWorkspace = new CreateWorkspaceUseCase(
    workspaceRepository,
    memberRepository,
    companyOnWorkspaceRepository,
    companyRepository,
  );

  const result = await createWorkspace.execute({
    data: {
      name: params.name || 'Test Workspace',
      kind: params.kind || WorkspaceKind.AGRICULTURAL,
      plan: params.plan || 'FREE',
    },
    userId: params.userId,
  });

  return {
    id: result.workspace.id,
    name: result.workspace.name,
    slug: result.workspace.slug,
    plan: result.workspace.plan,
  };
}

export async function deleteTestWorkspace(workspaceId: string): Promise<void> {
  if (!workspaceId) return;

  // Delete rules first
  await prisma.ruleOnCrop.deleteMany({
    where: { rule: { workspaceId } },
  });
  await prisma.ruleOnCompany.deleteMany({
    where: { rule: { workspaceId } },
  });
  await prisma.rule.deleteMany({ where: { workspaceId } });

  // Delete invitations
  await prisma.workspaceInvitation.deleteMany({ where: { workspaceId } });

  // Delete members
  await prisma.workspaceMember.deleteMany({ where: { workspaceId } });

  // Delete workspace
  await prisma.workspace.delete({ where: { id: workspaceId } });
}

export async function deleteAllTestWorkspaces(userId: string): Promise<void> {
  const userWorkspaces = await prisma.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  });

  for (const { workspaceId } of userWorkspaces) {
    await deleteTestWorkspace(workspaceId);
  }
}

export type ITestRule = Partial<PrismaRule> &
  Pick<PrismaRule, 'id' | 'name' | 'slug' | 'workspaceId'>;

export async function createTestRule(params: {
  workspaceId: string;
  userId: string;
  name?: string;
  category?: RuleCategory;
  content?: object;
}): Promise<ITestRule> {
  const ruleRepository = new PrismaRuleRepository(prisma);
  const workspaceRepository = new PrismaWorkspaceRepository(prisma);
  const memberRepository = new PrismaWorkspaceMemberRepository(prisma);
  const createRule = new CreateRuleUseCase(ruleRepository, workspaceRepository, memberRepository);

  const result = await createRule.execute({
    data: {
      workspaceId: params.workspaceId,
      name: params.name || 'Test Rule',
      category: params.category || 'DISCIPLINARE',
      content: params.content || { maxDose: 100 },
      createdById: params.userId,
    },
  });

  return {
    id: result.id,
    name: result.name,
    slug: result.slug,
    workspaceId: result.workspaceId,
    category: result.category,
  };
}

export async function deleteTestRule(ruleId: string): Promise<void> {
  if (!ruleId) return;

  await prisma.ruleOnCrop.deleteMany({ where: { ruleId } });
  await prisma.ruleOnCompany.deleteMany({ where: { ruleId } });
  await prisma.rule.delete({ where: { id: ruleId } });
}

export type ITestChat = Pick<PrismaChat, 'id' | 'userId' | 'threadId' | 'category'>;

export async function createTestChat(params: {
  userId: string;
  threadId?: string;
  category?: ChatCategory;
}): Promise<ITestChat> {
  const threadId = params.threadId ?? uuidv4();
  const chat = await prisma.chat.create({
    data: {
      userId: params.userId,
      threadId,
      category: params.category ?? 'DOSAGE_AGENT',
    },
  });
  return { id: chat.id, userId: chat.userId, threadId: chat.threadId, category: chat.category };
}

export async function deleteTestChat(chatId: string): Promise<void> {
  if (!chatId) return;
  await prisma.agentTask.deleteMany({ where: { chatId } });
  await prisma.message.deleteMany({ where: { chatId } });
  await prisma.chat.delete({ where: { id: chatId } }).catch(() => {});
}

export async function createTestAgentMemory(params: {
  userId: string;
  type: AgentMemoryType;
  key: string;
  content: unknown;
  importance?: number;
  expiresAt?: Date;
}): Promise<PrismaAgentMemory> {
  return prisma.agentMemory.create({
    data: {
      userId: params.userId,
      type: params.type,
      key: params.key,
      content: params.content as Prisma.InputJsonValue,
      importance: params.importance ?? 1.0,
      expiresAt: params.expiresAt,
    },
  });
}

export async function deleteAllAgentMemories(userId: string): Promise<void> {
  await prisma.agentMemory.deleteMany({ where: { userId } });
}

export async function createTestAgentTask(params: {
  chatId: string;
  threadId: string;
  content: string;
  sequence: number;
  status?: string;
  priority?: string;
}): Promise<PrismaAgentTask> {
  return prisma.agentTask.create({
    data: {
      chatId: params.chatId,
      threadId: params.threadId,
      content: params.content,
      sequence: params.sequence,
      status: params.status ?? 'pending',
      priority: params.priority ?? 'medium',
    },
  });
}

export async function deleteAllAgentTasks(threadId: string): Promise<void> {
  await prisma.agentTask.deleteMany({ where: { threadId } });
}

export async function createTestOuterLoopTrigger(params: {
  userId: string;
  type: string;
  title: string;
  payload: unknown;
  scheduledAt: Date;
  threadId?: string;
}): Promise<PrismaOuterLoopTrigger> {
  return prisma.outerLoopTrigger.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      payload: params.payload as Prisma.InputJsonValue,
      scheduledAt: params.scheduledAt,
      threadId: params.threadId,
    },
  });
}

export async function deleteAllOuterLoopTriggers(userId: string): Promise<void> {
  await prisma.outerLoopTrigger.deleteMany({ where: { userId } });
}
