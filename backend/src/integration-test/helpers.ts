import dotenv from 'dotenv';
dotenv.config();

import type { User as PrismaUser, Company as PrismaCompany, CompanyKind } from '@prisma/client';
import { createPrismaClient } from '../infrastructure/repositories/Prisma';
import { TEST_USER_EMAIL, TEST_USER_PASSWORD, TEST_USER_NAME, TEST_INVITE_CODE } from './constants';
import { PrismaUserRepository } from '../infrastructure/repositories/PrismaUserRepository';
import { RegisterUseCase } from '../application/use-cases/auth/RegisterUseCase';
import { PrismaCompanyRepository } from '../infrastructure/repositories/PrismaCompanyRepository';
import { PrismaUserOnCompanyRepository } from '../infrastructure/repositories/PrismaUserOnCompanyRepository';
import { PrismaWorkspaceRepository } from '../infrastructure/repositories/PrismaWorkspaceRepository';
import { PrismaWorkspaceMemberRepository } from '../infrastructure/repositories/PrismaWorkspaceMemberRepository';
import { PrismaCompanyOnWorkspaceRepository } from '../infrastructure/repositories/PrismaCompanyOnWorkspaceRepository';
import { CreateCompanyUseCase } from '../application/use-cases/company/CreateCompanyUseCase';

const prisma = createPrismaClient();

export type ITestUser = Partial<PrismaUser> &
  Pick<PrismaUser, 'id' | 'email' | 'name' | 'emailVerified'> & { password: string };
export type ITestCompany = Partial<PrismaCompany> &
  Pick<PrismaCompany, 'id' | 'name' | 'vatNumber' | 'fiscalCode' | 'email'>;

export async function createTestUser(): Promise<ITestUser> {
  const userRepository = new PrismaUserRepository(prisma);
  const existingUser = await userRepository.findByEmail(TEST_USER_EMAIL);
  if (existingUser) {
    return {
      id: existingUser.id,
      email: existingUser.email,
      password: TEST_USER_PASSWORD,
      name: existingUser.name,
      emailVerified: existingUser.emailVerified,
    };
  }

  const register = new RegisterUseCase(userRepository);
  const created = await register.execute({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
    name: TEST_USER_NAME,
    // Read INVITE_CODE at call time: `TEST_INVITE_CODE` is captured at import,
    // which (due to ES import hoisting) runs before dotenv.config() loads .env,
    // so the constant can hold the wrong fallback. At call time dotenv has run.
    inviteCode: process.env.INVITE_CODE || TEST_INVITE_CODE,
  });

  return {
    id: created.id,
    email: created.email,
    password: TEST_USER_PASSWORD,
    name: created.name,
    emailVerified: created.emailVerified,
  };
}

export async function deleteTestUser(): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: TEST_USER_EMAIL },
  });

  if (!user) {
    return;
  }
  await prisma.userOnCompany.deleteMany({
    where: { userId: user.id },
  });

  await prisma.settings.deleteMany({
    where: { userId: user.id },
  });

  await prisma.patentino.deleteMany({
    where: { userId: user.id },
  });

  // Clean up chats and related data
  const userChats = await prisma.chat.findMany({
    where: { userId: user.id },
    select: { id: true },
  });
  const chatIds = userChats.map((c) => c.id);
  if (chatIds.length > 0) {
    // Get all messages for these chats
    const messages = await prisma.message.findMany({
      where: { chatId: { in: chatIds } },
      select: { id: true },
    });
    const messageIds = messages.map((m) => m.id);

    if (messageIds.length > 0) {
      // Delete message sources
      await prisma.messageSource.deleteMany({
        where: { messageId: { in: messageIds } },
      });
    }

    // Delete messages
    await prisma.message.deleteMany({
      where: { chatId: { in: chatIds } },
    });

    // Delete chats
    await prisma.chat.deleteMany({
      where: { id: { in: chatIds } },
    });

    // Note: SourceCitation are not deleted as they might be shared across chats
    // They will be cleaned up by the test cleanup in afterEach
  }

  await prisma.user.delete({
    where: { id: user.id },
  });
}

export async function clearWarehousesByCompany(companyId: string): Promise<void> {
  await prisma.warehouse.deleteMany({ where: { companyId } });
}

export async function clearPatentiniByUser(userId: string): Promise<void> {
  await prisma.patentino.deleteMany({ where: { userId } });
}

export async function createTestCompany(params: {
  userId: string;
  name?: string;
  vatNumber?: string;
  fiscalCode?: string;
  kind?: CompanyKind;
}): Promise<ITestCompany> {
  const companyRepository = new PrismaCompanyRepository(prisma);
  const uocRepository = new PrismaUserOnCompanyRepository(prisma);
  const workspaceRepository = new PrismaWorkspaceRepository(prisma);
  const workspaceMemberRepository = new PrismaWorkspaceMemberRepository(prisma);
  const companyOnWorkspaceRepository = new PrismaCompanyOnWorkspaceRepository(prisma);
  const createCompany = new CreateCompanyUseCase(
    companyRepository,
    uocRepository,
    workspaceRepository,
    workspaceMemberRepository,
    companyOnWorkspaceRepository,
  );

  const generatedVat = String(Date.now()).slice(-11); // 11 digits
  const generatedFiscal = (Date.now().toString(36).toUpperCase() + 'TEST')
    .padEnd(16, 'X')
    .slice(0, 16);

  const result = await createCompany.execute({
    name: params.name || 'Test Company SRL',
    vatNumber: params.vatNumber || generatedVat,
    fiscalCode: params.fiscalCode || generatedFiscal,
    kind: params.kind,
    userId: params.userId,
    nation: 'Italia',
    city: 'Roma',
    address: 'Via Test 123',
    cap: '00100',
    email: 'test@testcompany.it',
    phoneNumber: '+393331234567',
    website: 'https://testcompany.it',
    logoUrl: 'https://testcompany.it/logo.png',
  });

  return {
    id: result.company.id,
    name: result.company.name,
    vatNumber: result.company.vatNumber,
    fiscalCode: result.company.fiscalCode,
    email: result.company.email,
  };
}

export async function deleteTestCompany(companyId: string): Promise<void> {
  if (!companyId) return;
  // Delete file extractions for this company
  await prisma.fileExtraction.deleteMany({ where: { companyId } });
  // Sales module + warehouse cleanup in FK order:
  // stock → DDT / proforma / order (cascade their items) → partner → product.
  const warehouses = await prisma.warehouse.findMany({ where: { companyId } });
  const warehouseIds = warehouses.map((w) => w.id);
  const products =
    warehouseIds.length > 0
      ? await prisma.product.findMany({ where: { warehouseId: { in: warehouseIds } } })
      : [];
  const productIds = products.map((p) => p.id);
  if (productIds.length > 0) {
    await prisma.stock.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.job.deleteMany({
      where: { stocks: { some: { productId: { in: productIds } } } },
    });
  }
  await prisma.salesInvoice.deleteMany({ where: { companyId } });
  await prisma.deliveryNote.deleteMany({ where: { companyId } });
  await prisma.proformaInvoice.deleteMany({ where: { companyId } });
  await prisma.salesOrder.deleteMany({ where: { companyId } });
  await prisma.businessPartner.deleteMany({ where: { companyId } });
  if (productIds.length > 0) {
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  }

  await prisma.userOnCompany.deleteMany({
    where: { companyId },
  });

  // Delete production units under fields of this company before deleting fields -> serve per la pulizia dati
  const fields = await prisma.field.findMany({ where: { companyId }, select: { id: true } });
  const fieldIds = fields.map((f) => f.id);
  if (fieldIds.length > 0) {
    const productionUnits = await prisma.productionUnit.findMany({
      where: { productionUnitsOnFields: { some: { fieldId: { in: fieldIds } } } },
      select: { id: true },
    });
    const productionUnitIds = productionUnits.map((pu) => pu.id);
    if (productionUnitIds.length > 0) {
      // Remove jobs linked to those production units (if any relation exists)
      await prisma.job.deleteMany({ where: { productionUnitId: { in: productionUnitIds } } });
      await prisma.productionUnit.deleteMany({ where: { id: { in: productionUnitIds } } });
    }
    await prisma.field.deleteMany({ where: { id: { in: fieldIds } } });
  }

  await prisma.warehouse.deleteMany({
    where: { companyId },
  });

  await prisma.machine.deleteMany({
    where: { companyId },
  });

  await prisma.company.delete({
    where: { id: companyId },
  });
}

export async function deleteAllTestCompanies(userId: string): Promise<void> {
  const userCompanies = await prisma.userOnCompany.findMany({
    where: { userId },
    select: { companyId: true },
  });

  for (const { companyId } of userCompanies) {
    await deleteTestCompany(companyId);
  }
}

// Workspace helpers
import { CreateWorkspaceUseCase } from '../application/use-cases/workspace/CreateWorkspaceUseCase';
import type { Workspace as PrismaWorkspace, WorkspacePlan } from '@prisma/client';
import { WorkspaceKind } from '@prisma/client';

export type ITestWorkspace = Partial<PrismaWorkspace> &
  Pick<PrismaWorkspace, 'id' | 'name' | 'slug'>;

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

// Rule helpers
import { PrismaRuleRepository } from '../infrastructure/repositories/PrismaRuleRepository';
import { CreateRuleUseCase } from '../application/use-cases/rule/CreateRuleUseCase';
import type { Rule as PrismaRule, RuleCategory } from '@prisma/client';

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

// ── Agent Upgrade helpers ──

import type {
  Chat as PrismaChat,
  ChatCategory,
  AgentMemory as PrismaAgentMemory,
  AgentMemoryType,
  AgentTask as PrismaAgentTask,
  OuterLoopTrigger as PrismaOuterLoopTrigger,
} from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

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

// Re-export Prisma for JSON value types in helpers
import { Prisma } from '@prisma/client';

export { prisma };
