import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { User } from '../../../domain/entities/User';
import type { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { AppError } from '../../../domain/errors/AppError';
import { getJwtSecret } from '../../../utils/get-jwt-secret';
import { INSTANCE_SETTING_KEYS } from '../../../infrastructure/settings/instanceSettingKeys';
import type { EncryptedSettingStore } from '../../../infrastructure/settings/encryptedSettingStore';
import { assertCompleteSetupInput } from './assertCompleteSetupInput';
import type { CompleteSetupInput, CompleteSetupResult } from './setupTypes';

export class CompleteSetupUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly settings: EncryptedSettingStore,
  ) {}

  async execute(input: CompleteSetupInput): Promise<CompleteSetupResult> {
    assertCompleteSetupInput(input);
    const completed = await this.settings.get(INSTANCE_SETTING_KEYS.setupCompleted);
    if (completed === 'true') {
      throw AppError.conflict('Setup is already completed', 'SETUP_ALREADY_COMPLETED');
    }

    const existing = await this.userRepository.findByEmail(input.admin.email);
    if (existing) {
      throw AppError.conflict('Email already exists', 'USER_EXISTS');
    }

    const hashedPassword = await bcrypt.hash(input.admin.password, 8);
    const created = await this.userRepository.create(
      User.create({
        email: input.admin.email.trim().toLowerCase(),
        password: hashedPassword,
        name: input.admin.name.trim(),
        surname: null,
        fiscalCode: null,
        companyName: null,
        vatNumber: null,
        phoneNumber: null,
        address: null,
        profilePictureUrl: null,
        role: UserRole.GOD,
        credits: 1000,
      }),
    );
    const admin = await this.userRepository.update(created.id, { emailVerified: true });
    await this.persistSettings(input);
    await this.settings.applyOverridesToEnv();

    const token = jwt.sign({ userId: admin.id }, getJwtSecret(), { expiresIn: '1d' });
    return {
      token,
      user: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    };
  }

  private async persistSettings(input: CompleteSetupInput): Promise<void> {
    await this.settings.set(INSTANCE_SETTING_KEYS.llmProvider, input.llm.provider);
    await this.settings.set(
      INSTANCE_SETTING_KEYS.llmBaseUrl,
      input.llm.baseUrl || 'http://127.0.0.1:11434',
    );
    await this.settings.set(INSTANCE_SETTING_KEYS.llmModel, input.llm.model || 'qwen3.5:4b');
    await this.settings.set(INSTANCE_SETTING_KEYS.llmApiKey, input.llm.apiKey || '');
    await this.settings.set(INSTANCE_SETTING_KEYS.accessMode, input.access.mode);
    await this.settings.set(INSTANCE_SETTING_KEYS.emailSmtpHost, input.email?.smtpHost || '');
    await this.settings.set(INSTANCE_SETTING_KEYS.emailUser, input.email?.user || '');
    await this.settings.set(INSTANCE_SETTING_KEYS.emailPassword, input.email?.password || '');
    await this.settings.set(INSTANCE_SETTING_KEYS.setupCompleted, 'true');
  }
}
