import { PrismaUserRepository } from '../infrastructure/repositories/PrismaUserRepository';
import { RegisterUseCase } from '../application/use-cases/auth/RegisterUseCase';
import { LoginUseCase } from '../application/use-cases/auth/LoginUseCase';
import { UpdatePasswordUseCase } from '../application/use-cases/auth/UpdatePasswordUseCase';
import { prisma } from './setup';
import { createTestUser, deleteTestUser } from './helpers';
import { TEST_USER_EMAIL, TEST_USER_PASSWORD, TEST_INVITE_CODE } from './constants';
import { AppError } from '../domain/errors/AppError';

describe('Auth Integration Tests', () => {
  let userRepository: PrismaUserRepository;
  let registerUseCase: RegisterUseCase;
  let loginUseCase: LoginUseCase;
  let updatePasswordUseCase: UpdatePasswordUseCase;

  beforeAll(() => {
    userRepository = new PrismaUserRepository(prisma);
    registerUseCase = new RegisterUseCase(userRepository);
    loginUseCase = new LoginUseCase(userRepository);
    updatePasswordUseCase = new UpdatePasswordUseCase(userRepository);
  });

  beforeEach(async () => {
    await deleteTestUser();
  });

  afterEach(async () => {
    await deleteTestUser();
  });

  describe('RegisterUseCase', () => {
    it('should register a new user successfully', async () => {
      const inputUserData = {
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
        name: 'Test User',
        inviteCode: TEST_INVITE_CODE,
      };

      const actualUser = await registerUseCase.execute(inputUserData);

      expect(actualUser).toBeDefined();
      expect(actualUser.email).toBe(TEST_USER_EMAIL);
      expect(actualUser.name).toBe('Test User');
      expect(actualUser.emailVerified).toBe(false);
      expect(actualUser.id).toBeDefined();

      const actualDbUser = await prisma.user.findUnique({
        where: { email: TEST_USER_EMAIL },
      });
      expect(actualDbUser).toBeDefined();
      expect(actualDbUser?.email).toBe(TEST_USER_EMAIL);
    });

    it('should throw error when email already exists', async () => {
      await createTestUser();

      const inputDuplicateUser = {
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
        name: 'Another User',
        inviteCode: TEST_INVITE_CODE,
      };

      await expect(registerUseCase.execute(inputDuplicateUser)).rejects.toThrow(AppError);
      await expect(registerUseCase.execute(inputDuplicateUser)).rejects.toThrow(
        'Email already exists',
      );
    });

    it('should register user with all optional fields', async () => {
      const inputCompleteUserData = {
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
        name: 'Test User',
        surname: 'Test Surname',
        fiscalCode: 'TSTCFD00A00X000X',
        phoneNumber: '+393331234567',
        address: 'Via Test 123, Roma',
        inviteCode: TEST_INVITE_CODE,
      };

      const actualUser = await registerUseCase.execute(inputCompleteUserData);

      expect(actualUser.surname).toBe('Test Surname');
      expect(actualUser.fiscalCode).toBe('TSTCFD00A00X000X');
      expect(actualUser.phoneNumber).toBe('+393331234567');
      expect(actualUser.address).toBe('Via Test 123, Roma');
    });
  });

  describe('LoginUseCase', () => {
    it('should login successfully with valid credentials', async () => {
      await createTestUser();

      const inputCredentials = {
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
      };

      const actualResult = await loginUseCase.execute(inputCredentials);

      expect(actualResult).toBeDefined();
      expect(actualResult.token).toBeDefined();
      expect(actualResult.user).toBeDefined();
      expect(actualResult.user.email).toBe(TEST_USER_EMAIL);
    });

    it('should throw error with invalid email', async () => {
      const inputInvalidCredentials = {
        email: 'nonexistent@test.it',
        password: TEST_USER_PASSWORD,
      };

      await expect(loginUseCase.execute(inputInvalidCredentials)).rejects.toThrow(AppError);
      await expect(loginUseCase.execute(inputInvalidCredentials)).rejects.toThrow(
        'Invalid credentials',
      );
    });

    it('should throw error with invalid password', async () => {
      await createTestUser();

      const inputInvalidPassword = {
        email: TEST_USER_EMAIL,
        password: 'WrongPassword123!',
      };

      await expect(loginUseCase.execute(inputInvalidPassword)).rejects.toThrow(AppError);
      await expect(loginUseCase.execute(inputInvalidPassword)).rejects.toThrow(
        'Invalid credentials',
      );
    });
  });

  describe('UpdatePasswordUseCase', () => {
    it('should update password successfully', async () => {
      const testUser = await createTestUser();

      const inputNewPassword = 'NewPassword123!';
      const inputPasswordData = {
        userId: testUser.id,
        oldPassword: TEST_USER_PASSWORD,
        newPassword: inputNewPassword,
        confirmPassword: inputNewPassword,
      };

      const actualUpdatedUser = await updatePasswordUseCase.execute(inputPasswordData);

      expect(actualUpdatedUser).toBeDefined();
      expect(actualUpdatedUser.id).toBe(testUser.id);

      const inputNewCredentials = {
        email: TEST_USER_EMAIL,
        password: inputNewPassword,
      };
      const actualLoginResult = await loginUseCase.execute(inputNewCredentials);
      expect(actualLoginResult.token).toBeDefined();
    });

    it('should throw error when old password is incorrect', async () => {
      const testUser = await createTestUser();

      const inputWrongOldPassword = {
        userId: testUser.id,
        oldPassword: 'WrongOldPassword123!',
        newPassword: 'NewPassword123!',
        confirmPassword: 'NewPassword123!',
      };

      await expect(updatePasswordUseCase.execute(inputWrongOldPassword)).rejects.toThrow(AppError);
      await expect(updatePasswordUseCase.execute(inputWrongOldPassword)).rejects.toThrow(
        'Old password is incorrect',
      );
    });

    it('should throw error when passwords do not match', async () => {
      const testUser = await createTestUser();

      const inputMismatchedPasswords = {
        userId: testUser.id,
        oldPassword: TEST_USER_PASSWORD,
        newPassword: 'NewPassword123!',
        confirmPassword: 'DifferentPassword123!',
      };

      await expect(updatePasswordUseCase.execute(inputMismatchedPasswords)).rejects.toThrow(
        AppError,
      );
      await expect(updatePasswordUseCase.execute(inputMismatchedPasswords)).rejects.toThrow(
        'New password and confirmation do not match',
      );
    });
  });
});
