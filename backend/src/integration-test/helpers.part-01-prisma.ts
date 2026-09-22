import { createPrismaClient } from '../infrastructure/repositories/Prisma';
import type { User as PrismaUser, Company as PrismaCompany, CompanyKind } from '@prisma/client';
import { PrismaUserRepository } from '../infrastructure/repositories/PrismaUserRepository';
import { TEST_USER_EMAIL, TEST_USER_PASSWORD, TEST_USER_NAME, TEST_INVITE_CODE } from './constants';
import { RegisterUseCase } from '../application/use-cases/auth/RegisterUseCase';
import { PrismaCompanyRepository } from '../infrastructure/repositories/PrismaCompanyRepository';
import { PrismaUserOnCompanyRepository } from '../infrastructure/repositories/PrismaUserOnCompanyRepository';
import { PrismaWorkspaceRepository } from '../infrastructure/repositories/PrismaWorkspaceRepository';
import { PrismaWorkspaceMemberRepository } from '../infrastructure/repositories/PrismaWorkspaceMemberRepository';
import { PrismaCompanyOnWorkspaceRepository } from '../infrastructure/repositories/PrismaCompanyOnWorkspaceRepository';
import { CreateCompanyUseCase } from '../application/use-cases/company/CreateCompanyUseCase';
import type { Workspace as PrismaWorkspace } from '@prisma/client';

export const prisma = createPrismaClient();

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

export type ITestWorkspace = Partial<PrismaWorkspace> &
  Pick<PrismaWorkspace, 'id' | 'name' | 'slug'>;
