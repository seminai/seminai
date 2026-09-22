import { PrismaUserRepository } from '../infrastructure/repositories/PrismaUserRepository';
import { VerifyEmailUseCase } from '../application/use-cases/auth/VerifyEmailUseCase';
import { prisma } from './setup';
import { createTestUser, deleteTestUser } from './helpers';
import { AppError } from '../domain/errors/AppError';
import jwt from 'jsonwebtoken';
import { PrismaSettingsRepository } from '../infrastructure/repositories/PrismaSettingsRepository';
import { Settings } from '../domain/entities/Settings';

describe('User Integration Tests', () => {
  let userRepository: PrismaUserRepository;
  let verifyEmailUseCase: VerifyEmailUseCase;
  let settingsRepository: PrismaSettingsRepository;

  beforeAll(() => {
    userRepository = new PrismaUserRepository(prisma);
    settingsRepository = new PrismaSettingsRepository(prisma);
    verifyEmailUseCase = new VerifyEmailUseCase(userRepository);
  });

  beforeEach(async () => {
    await deleteTestUser();
  });

  afterEach(async () => {
    await deleteTestUser();
  });

  describe('User CRUD Operations', () => {
    describe('Read Operations', () => {
      it('should find user by id', async () => {
        const testUser = await createTestUser();

        const actualFoundUser = await userRepository.findById(testUser.id);

        expect(actualFoundUser).toBeDefined();
        expect(actualFoundUser?.id).toBe(testUser.id);
        expect(actualFoundUser?.email).toBe(testUser.email);
      });

      it('should find user by email', async () => {
        const testUser = await createTestUser();

        const actualFoundUser = await userRepository.findByEmail(testUser.email);

        expect(actualFoundUser).toBeDefined();
        expect(actualFoundUser?.id).toBe(testUser.id);
        expect(actualFoundUser?.email).toBe(testUser.email);
      });

      it('should return null when user not found by id', async () => {
        const actualFoundUser = await userRepository.findById('non-existent-id');

        expect(actualFoundUser).toBeNull();
      });

      it('should return null when user not found by email', async () => {
        const actualFoundUser = await userRepository.findByEmail('nonexistent@test.it');

        expect(actualFoundUser).toBeNull();
      });
    });

    describe('Update Operations', () => {
      it('should update user profile successfully', async () => {
        const testUser = await createTestUser();

        const inputUpdateData = {
          name: 'Updated Name',
          surname: 'Updated Surname',
          phoneNumber: '+393339876543',
          address: 'Via Updated 456, Milano',
        };

        const actualUpdatedUser = await userRepository.update(testUser.id, inputUpdateData);

        expect(actualUpdatedUser).toBeDefined();
        expect(actualUpdatedUser.name).toBe('Updated Name');
        expect(actualUpdatedUser.surname).toBe('Updated Surname');
        expect(actualUpdatedUser.phoneNumber).toBe('+393339876543');
        expect(actualUpdatedUser.address).toBe('Via Updated 456, Milano');
        expect(actualUpdatedUser.email).toBe(testUser.email);
      });

      it('should update only specified fields', async () => {
        const testUser = await createTestUser();

        const inputPartialUpdate = {
          name: 'Only Name Updated',
        };

        const actualUpdatedUser = await userRepository.update(testUser.id, inputPartialUpdate);

        expect(actualUpdatedUser.name).toBe('Only Name Updated');
        expect(actualUpdatedUser.email).toBe(testUser.email);
      });

      it('should update fiscal code successfully', async () => {
        const testUser = await createTestUser();

        const inputUpdateFiscalCode = {
          fiscalCode: 'TSTCFD90A01H501X',
        };

        const actualUpdatedUser = await userRepository.update(testUser.id, inputUpdateFiscalCode);

        expect(actualUpdatedUser.fiscalCode).toBe('TSTCFD90A01H501X');

        const actualDbUser = await userRepository.findById(testUser.id);
        expect(actualDbUser?.fiscalCode).toBe('TSTCFD90A01H501X');
      });
    });

    describe('Delete Operations', () => {
      it('should delete user successfully', async () => {
        const testUser = await createTestUser();

        await userRepository.delete(testUser.id);

        const actualDeletedUser = await userRepository.findById(testUser.id);
        expect(actualDeletedUser).toBeNull();

        const actualDbUser = await userRepository.findById(testUser.id);
        expect(actualDbUser).toBeNull();
      });

      it('should delete user with all related data', async () => {
        const testUser = await createTestUser();

        const createdSettings = await settingsRepository.create(
          Settings.create({
            userId: testUser.id,
            language: 'it',
            qdcApiKey: null,
            ifarmingApiKey: null,
            whatsappInstanceName: null,
            whatsappApiKey: null,
            whatsappInstanceId: null,
            whatsappConnected: false,
            whatsappPhoneNumber: null,
            whatsappQrCode: null,
            whatsappLastSync: null,
            whatsappAllowedNumbers: [],
          }),
        );
        await settingsRepository.delete(createdSettings.id);

        await userRepository.delete(testUser.id);

        const actualDeletedUser = await userRepository.findById(testUser.id);
        expect(actualDeletedUser).toBeNull();

        const actualSettings = await settingsRepository.findByUserId(testUser.id);
        expect(actualSettings).toBeNull();
      });
    });
  });

  describe('VerifyEmailUseCase', () => {
    it('should verify email successfully with valid token', async () => {
      const testUser = await createTestUser();

      const verificationToken = jwt.sign(
        {
          userId: testUser.id,
          type: 'email_verification',
        },
        process.env.JWT_SECRET || 'default_secret',
        {
          expiresIn: '1d',
        },
      );

      await verifyEmailUseCase.execute({ token: verificationToken });

      const actualVerifiedUser = await userRepository.findById(testUser.id);
      expect(actualVerifiedUser?.emailVerified).toBe(true);

      const actualDbUser = await userRepository.findById(testUser.id);
      expect(actualDbUser?.emailVerified).toBe(true);
    });

    it('should throw error with invalid token', async () => {
      const inputInvalidToken = 'invalid-token-string';

      await expect(verifyEmailUseCase.execute({ token: inputInvalidToken })).rejects.toThrow(
        AppError,
      );
      await expect(verifyEmailUseCase.execute({ token: inputInvalidToken })).rejects.toThrow(
        'Invalid or expired verification token',
      );
    });

    it('should throw error with expired token', async () => {
      const testUser = await createTestUser();

      const expiredToken = jwt.sign(
        {
          userId: testUser.id,
          type: 'email_verification',
        },
        process.env.JWT_SECRET || 'default_secret',
        {
          expiresIn: '-1d',
        },
      );

      await expect(verifyEmailUseCase.execute({ token: expiredToken })).rejects.toThrow(AppError);
      await expect(verifyEmailUseCase.execute({ token: expiredToken })).rejects.toThrow(
        'Invalid or expired verification token',
      );
    });

    it('should throw error when user not found', async () => {
      const tokenForNonExistentUser = jwt.sign(
        {
          userId: 'non-existent-user-id',
          type: 'email_verification',
        },
        process.env.JWT_SECRET || 'default_secret',
        {
          expiresIn: '1d',
        },
      );

      await expect(verifyEmailUseCase.execute({ token: tokenForNonExistentUser })).rejects.toThrow(
        AppError,
      );
      await expect(verifyEmailUseCase.execute({ token: tokenForNonExistentUser })).rejects.toThrow(
        'User not found',
      );
    });
  });
});
