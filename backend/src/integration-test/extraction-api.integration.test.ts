import { prisma } from './setup';
import { RegisterExtractionApiUserUseCase } from '../application/use-cases/extraction-api/RegisterExtractionApiUserUseCase';
import { CreateExtractionApiKeyUseCase } from '../application/use-cases/extraction-api/CreateExtractionApiKeyUseCase';
import { GetExtractionApiAccountUseCase } from '../application/use-cases/extraction-api/GetExtractionApiAccountUseCase';
import { EnsureExtractionApiAccountUseCase } from '../application/use-cases/extraction-api/EnsureExtractionApiAccountUseCase';
import { AllocateExtractionPageQuotaUseCase } from '../application/use-cases/extraction-api/AllocateExtractionPageQuotaUseCase';
import { RevokeExtractionApiKeyUseCase } from '../application/use-cases/extraction-api/RevokeExtractionApiKeyUseCase';
import { ExtractDocumentApiUseCase } from '../application/use-cases/extraction-api/ExtractDocumentApiUseCase';
import { PrismaUserRepository } from '../infrastructure/repositories/PrismaUserRepository';
import { PrismaExtractionApiAccountRepository } from '../infrastructure/repositories/PrismaExtractionApiAccountRepository';
import { PrismaExtractionApiKeyRepository } from '../infrastructure/repositories/PrismaExtractionApiKeyRepository';
import { PrismaExtractionApiUsageLogRepository } from '../infrastructure/repositories/PrismaExtractionApiUsageLogRepository';
import type { InvoiceEntry } from '../domain/dtos/invoice-entry.dto';
import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { User } from '../domain/entities/User';
import { AppError } from '../domain/errors/AppError';

const TEST_EMAIL = `extraction-api-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';
const TEST_INVITE = process.env.EXTRACTION_API_INVITE_CODE ?? 'extraction-api-test-invite';

describe('Extraction API integration', () => {
  const userRepository = new PrismaUserRepository(prisma);
  const accountRepository = new PrismaExtractionApiAccountRepository(prisma);
  const keyRepository = new PrismaExtractionApiKeyRepository(prisma);
  const usageRepository = new PrismaExtractionApiUsageLogRepository(prisma);

  let userId = '';

  beforeAll(async () => {
    process.env.EXTRACTION_API_INVITE_CODE = TEST_INVITE;
    process.env.EXTRACTION_API_TRIAL_PAGES = '10';
    const user = await new RegisterExtractionApiUserUseCase(
      userRepository,
      accountRepository,
    ).execute({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      name: 'Extraction API Tester',
      inviteCode: TEST_INVITE,
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (!userId) return;
    await prisma.extractionApiUsageLog.deleteMany({ where: { userId } });
    await prisma.extractionApiKey.deleteMany({ where: { userId } });
    await prisma.extractionApiAccount.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it('registers account with trial quota', async () => {
    const account = await new GetExtractionApiAccountUseCase(accountRepository).execute(userId);
    expect(account.pageQuota).toBe(10);
    expect(account.pagesUsed).toBe(0);
    expect(account.pagesRemaining).toBe(10);
  });

  it('creates and revokes API keys', async () => {
    const created = await new CreateExtractionApiKeyUseCase(keyRepository).execute({
      userId,
      name: 'integration-key',
    });
    expect(created.secret.startsWith('sk_live_')).toBe(true);
    const revoked = await new RevokeExtractionApiKeyUseCase(keyRepository).execute({
      userId,
      keyId: created.key.id,
    });
    expect(revoked.revokedAt).not.toBeNull();
  });

  it('allocates additional page quota via admin use case', async () => {
    const account = await new AllocateExtractionPageQuotaUseCase(accountRepository).execute({
      userId,
      addPages: 90,
    });
    expect(account.pageQuota).toBe(100);
    expect(account.pagesRemaining).toBe(100);
  });

  it('extracts with stubbed pipeline and decrements quota', async () => {
    const entry: InvoiceEntry = {
      productName: 'STUB PRODUCT',
      registrationNumber: null,
      productCategory: 'OTHER',
      administrativeStatus: null,
      quantity: 2,
      quantityUnitOfMeasure: 'NR',
      supplierName: 'Supplier',
      supplierVat: null,
      invoiceNumber: '100',
      invoiceDate: '2025-06-01',
      invoiceDueDate: null,
      unitPrice: 5,
      totalPrice: 10,
    };
    const useCase = new ExtractDocumentApiUseCase(accountRepository, usageRepository, {
      invoiceServiceFactory: () =>
        ({
          execute: jest.fn().mockResolvedValue({ entries: [entry], rawTextPath: '/tmp/stub.xml' }),
        }) as never,
    });
    const result = await useCase.execute({
      userId,
      apiKeyId: null,
      fileBuffer: Buffer.from('<xml />'),
      fileName: 'invoice.xml',
      mimeType: 'application/xml',
      documentType: 'invoice',
    });
    expect(result.entries).toHaveLength(1);
    expect(result.pagesCharged).toBe(0);
    const account = await new GetExtractionApiAccountUseCase(accountRepository).execute(userId);
    expect(account.pagesUsed).toBe(0);
  });
});

describe('Ensure Extraction API account', () => {
  const userRepository = new PrismaUserRepository(prisma);
  const accountRepository = new PrismaExtractionApiAccountRepository(prisma);
  const ensureAccountUseCase = new EnsureExtractionApiAccountUseCase(accountRepository);
  const getAccountUseCase = new GetExtractionApiAccountUseCase(accountRepository);

  const existingUserEmail = `existing-seminai-${Date.now()}@example.com`;
  let existingUserId = '';

  beforeAll(async () => {
    process.env.EXTRACTION_API_TRIAL_PAGES = '10';
    const hashedPassword = await bcrypt.hash('TestPassword123!', 8);
    const user = User.create({
      email: existingUserEmail,
      password: hashedPassword,
      name: 'Existing Seminai User',
      surname: null,
      fiscalCode: null,
      companyName: null,
      vatNumber: null,
      phoneNumber: null,
      address: null,
      profilePictureUrl: null,
      role: UserRole.BASIC,
      credits: 0,
    });
    const createdUser = await userRepository.create(user);
    existingUserId = createdUser.id;
  });

  afterAll(async () => {
    if (!existingUserId) return;
    await prisma.extractionApiAccount.deleteMany({ where: { userId: existingUserId } });
    await prisma.user.deleteMany({ where: { id: existingUserId } });
  });

  it('auto-provisions trial account for existing Seminai user without Extraction API account', async () => {
    await expect(getAccountUseCase.execute(existingUserId)).rejects.toEqual(
      AppError.notFound('Extraction API account not found', 'EXTRACTION_API_ACCOUNT_NOT_FOUND'),
    );
    const account = await ensureAccountUseCase.execute(existingUserId);
    expect(account.pageQuota).toBe(10);
    expect(account.pagesUsed).toBe(0);
    expect(account.pagesRemaining).toBe(10);
  });

  it('is idempotent and does not create duplicate accounts', async () => {
    const first = await ensureAccountUseCase.execute(existingUserId);
    const second = await ensureAccountUseCase.execute(existingUserId);
    expect(second).toEqual(first);
    const rows = await prisma.extractionApiAccount.findMany({ where: { userId: existingUserId } });
    expect(rows).toHaveLength(1);
  });
});
