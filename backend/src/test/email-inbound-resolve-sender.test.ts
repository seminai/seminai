import { ResolveSenderUseCase } from '../application/use-cases/email-inbound/ResolveSenderUseCase';
import { type ICompanyRepository } from '../domain/repositories/ICompanyRepository';
import { type ISettingsRepository } from '../domain/repositories/ISettingsRepository';
import { type IUserRepository } from '../domain/repositories/IUserRepository';
import { User } from '../domain/entities/User';
import { Company } from '../domain/entities/Company';
import { Settings } from '../domain/entities/Settings';

function makeSettings(emailIngestionEnabled: boolean): Settings {
  const now = new Date();
  return new Settings({
    id: 's1',
    userId: 'user-1',
    language: 'it',
    qdcApiKey: null,
    ifarmingApiKey: null,
    tablesViewMode: 'grid',
    whatsappInstanceName: null,
    whatsappApiKey: null,
    whatsappInstanceId: null,
    whatsappConnected: false,
    whatsappPhoneNumber: null,
    whatsappQrCode: null,
    whatsappLastSync: null,
    whatsappAllowedNumbers: [],
    emailIngestionEnabled,
    openMeteoEnabled: false,
    qdcSyncEnabled: false,
    createdAt: now,
    updatedAt: now,
  });
}

function buildSettingsRepoMock(settings: Settings | null): ISettingsRepository {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findByUserId: jest.fn().mockResolvedValue(settings),
    findByWhatsappInstanceName: jest.fn(),
    update: jest.fn(),
    updateWhatsAppConfig: jest.fn(),
    delete: jest.fn(),
  } as unknown as ISettingsRepository;
}

function makeUser(overrides: Partial<{ id: string; email: string; name: string }> = {}): User {
  return new User(
    overrides.id ?? 'user-1',
    overrides.email ?? 'mario@example.com',
    null,
    overrides.name ?? 'Mario',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    'BASIC',
    0,
    false,
    new Date(),
    new Date(),
  );
}

function makeCompany(id: string, name: string): Company {
  return new Company(
    id,
    name,
    '12345678901',
    null,
    null,
    'FISCAL',
    'IT',
    'Roma',
    null,
    null,
    null,
    null,
    null,
    null,
    new Date(),
  );
}

function buildUserRepoMock(user: User | null): IUserRepository {
  return {
    create: jest.fn(),
    findByEmail: jest.fn().mockResolvedValue(user),
    findById: jest.fn(),
    findByPhoneNumber: jest.fn(),
    findByGoogleId: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deductCredits: jest.fn(),
  } as unknown as IUserRepository;
}

function buildCompanyRepoMock(companies: Company[]): ICompanyRepository {
  return {
    create: jest.fn(),
    createMany: jest.fn(),
    findById: jest.fn(),
    findManyByUserId: jest.fn().mockResolvedValue(companies),
    findByVatNumber: jest.fn(),
    findByFiscalCode: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteWithAllData: jest.fn(),
  } as unknown as ICompanyRepository;
}

describe('ResolveSenderUseCase', () => {
  it('returns "unknown" when no user matches the from address', async () => {
    const useCase = new ResolveSenderUseCase(
      buildUserRepoMock(null),
      buildCompanyRepoMock([]),
      buildSettingsRepoMock(makeSettings(true)),
    );
    const result = await useCase.execute({ fromAddress: 'nobody@example.com' });
    expect(result.kind).toBe('unknown');
  });

  it('returns "opt_out" when the user has Settings with emailIngestionEnabled=false', async () => {
    const useCase = new ResolveSenderUseCase(
      buildUserRepoMock(makeUser({ id: 'u1' })),
      buildCompanyRepoMock([makeCompany('c1', 'Acme')]),
      buildSettingsRepoMock(makeSettings(false)),
    );
    const result = await useCase.execute({ fromAddress: 'mario@example.com' });
    expect(result).toEqual({ kind: 'opt_out', userId: 'u1' });
  });

  it('returns "opt_out" when the user has no Settings row yet', async () => {
    const useCase = new ResolveSenderUseCase(
      buildUserRepoMock(makeUser({ id: 'u1' })),
      buildCompanyRepoMock([makeCompany('c1', 'Acme')]),
      buildSettingsRepoMock(null),
    );
    const result = await useCase.execute({ fromAddress: 'mario@example.com' });
    expect(result.kind).toBe('opt_out');
  });

  it('returns "no_companies" when ingestion is enabled but the user has no UserOnCompany rows', async () => {
    const useCase = new ResolveSenderUseCase(
      buildUserRepoMock(makeUser({ id: 'u1' })),
      buildCompanyRepoMock([]),
      buildSettingsRepoMock(makeSettings(true)),
    );
    const result = await useCase.execute({ fromAddress: 'mario@example.com' });
    expect(result).toEqual({ kind: 'no_companies', userId: 'u1' });
  });

  it('returns "single" when ingestion is enabled and the user belongs to exactly one company', async () => {
    const useCase = new ResolveSenderUseCase(
      buildUserRepoMock(makeUser({ id: 'u1' })),
      buildCompanyRepoMock([makeCompany('c1', 'Acme')]),
      buildSettingsRepoMock(makeSettings(true)),
    );
    const result = await useCase.execute({ fromAddress: 'mario@example.com' });
    expect(result).toEqual({ kind: 'single', userId: 'u1', companyId: 'c1' });
  });

  it('returns "multiple" with numbered candidates when ingestion is enabled and the user belongs to several companies', async () => {
    const useCase = new ResolveSenderUseCase(
      buildUserRepoMock(makeUser({ id: 'u1' })),
      buildCompanyRepoMock([makeCompany('c1', 'Acme'), makeCompany('c2', 'Beta')]),
      buildSettingsRepoMock(makeSettings(true)),
    );
    const result = await useCase.execute({ fromAddress: 'mario@example.com' });
    if (result.kind !== 'multiple') throw new Error('expected multiple');
    expect(result.userId).toBe('u1');
    expect(result.candidates).toEqual([
      { index: 1, companyId: 'c1', companyName: 'Acme' },
      { index: 2, companyId: 'c2', companyName: 'Beta' },
    ]);
  });

  it('lowercases the from address before lookup', async () => {
    const userRepo = buildUserRepoMock(makeUser({ id: 'u1' }));
    const useCase = new ResolveSenderUseCase(
      userRepo,
      buildCompanyRepoMock([makeCompany('c1', 'Acme')]),
      buildSettingsRepoMock(makeSettings(true)),
    );
    await useCase.execute({ fromAddress: 'Mario@Example.com' });
    expect(userRepo.findByEmail).toHaveBeenCalledWith('mario@example.com');
  });
});
