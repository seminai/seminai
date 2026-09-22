import { PrismaUserOnCompanyRepository } from '../infrastructure/repositories/PrismaUserOnCompanyRepository';
import { PrismaCompanyRepository } from '../infrastructure/repositories/PrismaCompanyRepository';
import { AddUserToCompanyUseCase } from '../application/use-cases/user-on-company/AddUserToCompanyUseCase';
import { RemoveUserFromCompanyUseCase } from '../application/use-cases/user-on-company/RemoveUserFromCompanyUseCase';
import { UpdateUserRoleUseCase } from '../application/use-cases/user-on-company/UpdateUserRoleUseCase';
import { prisma } from './setup';
import {
  createTestUser,
  deleteTestUser,
  createTestCompany,
  deleteAllTestCompanies,
} from './helpers';
import { AppError } from '../domain/errors/AppError';
import { TEST_INVITE_CODE } from './constants';
import { CompanyRole } from '@prisma/client';
import { PrismaUserRepository } from '../infrastructure/repositories/PrismaUserRepository';
import { RegisterUseCase } from '../application/use-cases/auth/RegisterUseCase';

describe('UserOnCompany Integration Tests', () => {
  let userOnCompanyRepository: PrismaUserOnCompanyRepository;
  let companyRepository: PrismaCompanyRepository;
  let userRepository: PrismaUserRepository;
  let addUserToCompanyUseCase: AddUserToCompanyUseCase;
  let removeUserFromCompanyUseCase: RemoveUserFromCompanyUseCase;
  let updateUserRoleUseCase: UpdateUserRoleUseCase;
  let testUserId: string;
  let testCompanyId: string;
  let secondUserId: string;

  beforeAll(async () => {
    userOnCompanyRepository = new PrismaUserOnCompanyRepository(prisma);
    companyRepository = new PrismaCompanyRepository(prisma);
    userRepository = new PrismaUserRepository(prisma);
    addUserToCompanyUseCase = new AddUserToCompanyUseCase(
      userOnCompanyRepository,
      companyRepository,
      userRepository,
    );
    removeUserFromCompanyUseCase = new RemoveUserFromCompanyUseCase(userOnCompanyRepository);
    updateUserRoleUseCase = new UpdateUserRoleUseCase(userOnCompanyRepository);

    const testUser = await createTestUser();
    testUserId = testUser.id!;
    const second = await userRepository.findByEmail('second@test.it');
    if (second) {
      secondUserId = second.id;
    } else {
      const registerUseCase = new RegisterUseCase(userRepository);
      const created = await registerUseCase.execute({
        email: 'second@test.it',
        password: 'SecondPassword123!',
        name: 'Second Test User',
        surname: null,
        fiscalCode: null,
        phoneNumber: null,
        address: null,
        inviteCode: TEST_INVITE_CODE,
      });
      secondUserId = created.id;
    }

    const company = await createTestCompany({ userId: testUserId });
    testCompanyId = company.id!;
  });

  afterAll(async () => {
    await deleteAllTestCompanies(testUserId);
    await deleteTestUser();
    await userRepository.delete(secondUserId);
  });

  beforeEach(async () => {
    await userOnCompanyRepository.deleteByCompanyAndUser(testCompanyId, secondUserId);
  });

  describe('AddUserToCompanyUseCase', () => {
    it('should add existing user to company successfully', async () => {
      const secondUser = await userRepository.findById(secondUserId);

      const inputAddUserData = {
        companyId: testCompanyId,
        email: secondUser!.email,
        name: secondUser!.name!,
        role: CompanyRole.EDITOR,
        invitedBy: 'test@test.it',
      };

      const actualUserOnCompany = await addUserToCompanyUseCase.execute(inputAddUserData);

      expect(actualUserOnCompany).toBeDefined();
      expect(actualUserOnCompany.userId).toBe(secondUserId);
      expect(actualUserOnCompany.companyId).toBe(testCompanyId);
      expect(actualUserOnCompany.role).toBe(CompanyRole.EDITOR);

      const actualDbUserOnCompany = await userOnCompanyRepository.findByCompanyAndUser(
        testCompanyId,
        secondUserId,
      );
      expect(actualDbUserOnCompany).toBeDefined();
    });

    it('should create new user and add to company', async () => {
      const inputNewUserData = {
        companyId: testCompanyId,
        email: 'newuser@test.it',
        name: 'New User',
        role: CompanyRole.VIEWER,
        invitedBy: 'test@test.it',
      };

      const actualUserOnCompany = await addUserToCompanyUseCase.execute(inputNewUserData);

      expect(actualUserOnCompany).toBeDefined();
      expect(actualUserOnCompany.companyId).toBe(testCompanyId);
      expect(actualUserOnCompany.role).toBe(CompanyRole.VIEWER);

      const actualCreatedUser = await userRepository.findByEmail('newuser@test.it');
      expect(actualCreatedUser).toBeDefined();
      expect(actualCreatedUser?.name).toBe('New User');

      await userOnCompanyRepository.deleteByCompanyAndUser(testCompanyId, actualCreatedUser!.id);
      await userRepository.delete(actualCreatedUser!.id);
    });

    it('should throw error when user already in company', async () => {
      const secondUser = await userRepository.findById(secondUserId);

      const inputAddUserData = {
        companyId: testCompanyId,
        email: secondUser!.email,
        name: secondUser!.name,
        role: CompanyRole.VIEWER,
        invitedBy: 'test@test.it',
      };

      await addUserToCompanyUseCase.execute(inputAddUserData);

      await expect(addUserToCompanyUseCase.execute(inputAddUserData)).rejects.toThrow(AppError);
      await expect(addUserToCompanyUseCase.execute(inputAddUserData)).rejects.toThrow(
        'User already belongs to this company',
      );
    });

    it('should throw error when company does not exist', async () => {
      const inputNonExistentCompany = {
        companyId: 'non-existent-company-id',
        email: 'user@test.it',
        name: 'Test User',
        role: CompanyRole.VIEWER,
        invitedBy: 'test@test.it',
      };

      await expect(addUserToCompanyUseCase.execute(inputNonExistentCompany)).rejects.toThrow(
        AppError,
      );
      await expect(addUserToCompanyUseCase.execute(inputNonExistentCompany)).rejects.toThrow(
        'Company not found',
      );
    });
  });

  describe('UpdateUserRoleUseCase', () => {
    it('should update user role successfully', async () => {
      const secondUser = await prisma.user.findUnique({ where: { id: secondUserId } });

      const inputAddUserData = {
        companyId: testCompanyId,
        email: secondUser!.email,
        name: secondUser!.name,
        role: CompanyRole.VIEWER,
        invitedBy: 'test@test.it',
      };

      const createdUserOnCompany = await addUserToCompanyUseCase.execute(inputAddUserData);

      const inputUpdateRole = {
        userOnCompanyId: createdUserOnCompany.id,
        role: CompanyRole.ADMIN,
      };

      const actualUpdatedUserOnCompany = await updateUserRoleUseCase.execute(inputUpdateRole);

      expect(actualUpdatedUserOnCompany).toBeDefined();
      expect(actualUpdatedUserOnCompany.role).toBe(CompanyRole.ADMIN);

      const actualDbUserOnCompany = await userOnCompanyRepository.findById(createdUserOnCompany.id);
      expect(actualDbUserOnCompany?.role).toBe(CompanyRole.ADMIN);
    });

    it('should throw error when user on company not found', async () => {
      const inputNonExistentUpdate = {
        userOnCompanyId: 'non-existent-id',
        role: CompanyRole.ADMIN,
      };

      await expect(updateUserRoleUseCase.execute(inputNonExistentUpdate)).rejects.toThrow(AppError);
      await expect(updateUserRoleUseCase.execute(inputNonExistentUpdate)).rejects.toThrow(
        'User-Company relationship not found',
      );
    });
  });

  describe('RemoveUserFromCompanyUseCase', () => {
    it('should remove user from company successfully', async () => {
      const secondUser = await userRepository.findById(secondUserId);

      const inputAddUserData = {
        companyId: testCompanyId,
        email: secondUser!.email,
        name: secondUser!.name,
        role: CompanyRole.VIEWER,
        invitedBy: 'test@test.it',
      };

      await addUserToCompanyUseCase.execute(inputAddUserData);

      await removeUserFromCompanyUseCase.execute({
        companyId: testCompanyId,
        userId: secondUserId,
      });

      const actualDeletedUserOnCompany = await userOnCompanyRepository.findByCompanyAndUser(
        testCompanyId,
        secondUserId,
      );
      expect(actualDeletedUserOnCompany).toBeNull();
    });

    it('should throw error when user on company not found', async () => {
      await expect(
        removeUserFromCompanyUseCase.execute({
          companyId: testCompanyId,
          userId: 'non-existent-user-id',
        }),
      ).rejects.toThrow(AppError);
      await expect(
        removeUserFromCompanyUseCase.execute({
          companyId: testCompanyId,
          userId: 'non-existent-user-id',
        }),
      ).rejects.toThrow('User-Company relationship not found');
    });
  });

  describe('UserOnCompanyRepository Operations', () => {
    it('should find users by company id', async () => {
      const secondUser = await prisma.user.findUnique({ where: { id: secondUserId } });

      const inputAddUserData = {
        companyId: testCompanyId,
        email: secondUser!.email,
        name: secondUser!.name,
        role: CompanyRole.EDITOR,
        invitedBy: 'test@test.it',
      };

      await addUserToCompanyUseCase.execute(inputAddUserData);

      const actualUsersInCompany = await userOnCompanyRepository.findByCompanyId(testCompanyId);

      expect(actualUsersInCompany).toBeDefined();
      expect(actualUsersInCompany.length).toBeGreaterThanOrEqual(2);
      const actualSecondUser = actualUsersInCompany.find((u) => u.userId === secondUserId);
      expect(actualSecondUser).toBeDefined();
    });

    it('should find companies by user id', async () => {
      const actualUserCompanies = await userOnCompanyRepository.findByUserId(testUserId);

      expect(actualUserCompanies).toBeDefined();
      expect(actualUserCompanies.length).toBeGreaterThanOrEqual(1);
      const actualTestCompany = actualUserCompanies.find((c) => c.companyId === testCompanyId);
      expect(actualTestCompany).toBeDefined();
    });
  });
});
