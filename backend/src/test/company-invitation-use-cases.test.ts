import { CompanyRole, UserRole } from '@prisma/client';
import { AddUserToCompanyUseCase } from '../application/use-cases/user-on-company/AddUserToCompanyUseCase';
import { ResendCompanyInvitationUseCase } from '../application/use-cases/user-on-company/ResendCompanyInvitationUseCase';
import { User } from '../domain/entities/User';
import { UserOnCompany } from '../domain/entities/UserOnCompany';
import { Company } from '../domain/entities/Company';
import { IUserOnCompanyRepository } from '../domain/repositories/IUserOnCompanyRepository';
import { ICompanyRepository } from '../domain/repositories/ICompanyRepository';
import { IUserRepository } from '../domain/repositories/IUserRepository';
import { EmailService } from '../infrastructure/services/EmailService';

describe('Company invitation use cases', () => {
  let userOnCompanyRepository: jest.Mocked<IUserOnCompanyRepository>;
  let companyRepository: jest.Mocked<ICompanyRepository>;
  let userRepository: jest.Mocked<IUserRepository>;
  let sendInvitationEmailSpy: jest.SpyInstance;
  let sendUserAddedToCompanyEmailSpy: jest.SpyInstance;
  const company = new Company(
    'company-1',
    'Tecnolam',
    '12345678901',
    null,
    null,
    'RSSMRA80A01H501U',
    'IT',
    'Roma',
    'Via Roma 1',
    '00100',
    'info@tecnolam.test',
    null,
    null,
    null,
    new Date(),
    new Date(),
  );

  beforeEach(() => {
    userOnCompanyRepository = createUserOnCompanyRepository();
    companyRepository = createCompanyRepository();
    userRepository = createUserRepository();
    companyRepository.findById.mockResolvedValue(company);
    sendInvitationEmailSpy = jest
      .spyOn(EmailService.getInstance(), 'sendInvitationEmail')
      .mockResolvedValue();
    sendUserAddedToCompanyEmailSpy = jest
      .spyOn(EmailService.getInstance(), 'sendUserAddedToCompanyEmail')
      .mockResolvedValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends temporary password when adding an existing pending user to a company', async () => {
    const inputUser = createUser({ lastAccessAt: null });
    const updatedUser = createUser({ lastAccessAt: null });
    const useCase = new AddUserToCompanyUseCase(
      userOnCompanyRepository,
      companyRepository,
      userRepository,
    );
    userRepository.findByEmail.mockResolvedValue(inputUser);
    userRepository.update.mockResolvedValue(updatedUser);
    userOnCompanyRepository.findByCompanyAndUser.mockResolvedValue(null);
    userOnCompanyRepository.create.mockImplementation(async (relation) => relation);

    const actualRelation = await useCase.execute({
      companyId: company.id,
      email: 'USER@EXAMPLE.COM',
      name: 'Pending User',
      role: CompanyRole.ADMIN,
      invitedBy: 'Admin',
    });

    expect(userRepository.findByEmail).toHaveBeenCalledWith('user@example.com');
    expect(userRepository.update).toHaveBeenCalledWith(inputUser.id, {
      password: expect.any(String),
    });
    expect(sendInvitationEmailSpy).toHaveBeenCalledWith(
      updatedUser.email,
      updatedUser.name,
      expect.any(String),
      'Admin',
      company.id,
      company.name,
    );
    expect(sendUserAddedToCompanyEmailSpy).not.toHaveBeenCalled();
    expect(actualRelation.userId).toBe(inputUser.id);
  });

  it('resends company invitation only for pending local accounts', async () => {
    const inputUser = createUser({ lastAccessAt: null });
    const updatedUser = createUser({ lastAccessAt: null });
    const relation = new UserOnCompany(
      'relation-1',
      company.id,
      inputUser.id,
      null,
      CompanyRole.ADMIN,
    );
    const useCase = new ResendCompanyInvitationUseCase(
      userOnCompanyRepository,
      companyRepository,
      userRepository,
    );
    userOnCompanyRepository.findByCompanyAndUser.mockResolvedValue(relation);
    userRepository.findById.mockResolvedValue(inputUser);
    userRepository.update.mockResolvedValue(updatedUser);

    await useCase.execute({ companyId: company.id, userId: inputUser.id, invitedBy: 'Admin' });

    expect(userRepository.update).toHaveBeenCalledWith(inputUser.id, {
      password: expect.any(String),
    });
    expect(sendInvitationEmailSpy).toHaveBeenCalledWith(
      updatedUser.email,
      updatedUser.name,
      expect.any(String),
      'Admin',
      company.id,
      company.name,
    );
  });
});

function createUser(overrides: { readonly lastAccessAt: Date | null }): User {
  return new User(
    'user-1',
    'user@example.com',
    'hashed-password',
    'Pending User',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    UserRole.BASIC,
    10,
    false,
    new Date(),
    new Date(),
    null,
    overrides.lastAccessAt,
  );
}

function createUserOnCompanyRepository(): jest.Mocked<IUserOnCompanyRepository> {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findByCompanyId: jest.fn(),
    findByCompanyIdWithDetails: jest.fn(),
    findByUserId: jest.fn(),
    findByUserIdWithDetails: jest.fn(),
    findByCompanyAndUser: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteByCompanyAndUser: jest.fn(),
  };
}

function createCompanyRepository(): jest.Mocked<ICompanyRepository> {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findByVatNumber: jest.fn(),
    findByFiscalCode: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteWithAllData: jest.fn(),
    getCourierEmail: jest.fn(),
    setCourierEmail: jest.fn(),
    findManyByUserId: jest.fn(),
    createMany: jest.fn(),
    updateMany: jest.fn(),
  };
}

function createUserRepository(): jest.Mocked<IUserRepository> {
  return {
    create: jest.fn(),
    findByEmail: jest.fn(),
    findById: jest.fn(),
    findByPhoneNumber: jest.fn(),
    findByGoogleId: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deductCredits: jest.fn(),
  };
}
