import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { User } from '../../../domain/entities/User';
import { AppError } from '../../../domain/errors/AppError';
import type { IUserRepository } from '../../../domain/repositories/IUserRepository';
import type { IExtractionApiAccountRepository } from '../../../domain/repositories/IExtractionApiAccountRepository';
import {
  getExtractionApiInviteCode,
  getExtractionApiTrialPages,
} from '../../../infrastructure/services/extraction-api/extraction-api.config';

interface RegisterExtractionApiUserDTO {
  readonly email: string;
  readonly password: string;
  readonly name: string;
  readonly inviteCode: string;
}

export class RegisterExtractionApiUserUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly accountRepository: IExtractionApiAccountRepository,
  ) {}

  async execute(input: RegisterExtractionApiUserDTO): Promise<User> {
    const validCode = getExtractionApiInviteCode();
    if (!validCode || input.inviteCode !== validCode) {
      throw AppError.badRequest('Invalid or missing invite code', 'INVALID_INVITE_CODE');
    }
    const existing = await this.userRepository.findByEmail(input.email);
    if (existing) {
      throw AppError.conflict('Email already exists', 'USER_EXISTS');
    }
    const hashedPassword = await bcrypt.hash(input.password, 8);
    const user = User.create({
      email: input.email,
      password: hashedPassword,
      name: input.name,
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
    const createdUser = await this.userRepository.create(user);
    await this.accountRepository.createForUser(createdUser.id, getExtractionApiTrialPages());
    return createdUser;
  }
}
