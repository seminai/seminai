import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../../../domain/entities/User';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { EmailService } from '../../../infrastructure/services/EmailService';
import { AppError } from '../../../domain/errors/AppError';
import { UserRole } from '@prisma/client';
import { getJwtSecret } from '../../../utils/get-jwt-secret';

interface RegisterDTO {
  email: string;
  password: string;
  name: string;
  inviteCode: string;
  surname?: string | null;
  fiscalCode?: string | null;
  phoneNumber?: string | null;
  address?: string | null;
  profilePictureUrl?: string | null;
}

export class RegisterUseCase {
  private emailService: EmailService;

  constructor(private userRepository: IUserRepository) {
    this.emailService = EmailService.getInstance();
  }

  async execute({
    email,
    password,
    name,
    inviteCode,
    surname = null,
    fiscalCode = null,
    phoneNumber = null,
    address = null,
    profilePictureUrl = null,
  }: RegisterDTO): Promise<User> {
    const validCode = process.env.INVITE_CODE;
    if (!validCode || inviteCode !== validCode) {
      throw AppError.badRequest('Invalid or missing invite code', 'INVALID_INVITE_CODE');
    }
    const userExists = await this.userRepository.findByEmail(email);

    if (userExists) {
      throw AppError.conflict('Email already exists', 'USER_EXISTS');
    }

    const hashedPassword = await bcrypt.hash(password, 8);

    const user = User.create({
      email,
      password: hashedPassword,
      name,
      surname,
      fiscalCode,
      companyName: null,
      vatNumber: null,
      phoneNumber,
      address,
      profilePictureUrl,
      role: UserRole.BASIC,
      credits: 10,
    });

    const createdUser = await this.userRepository.create(user);

    const verificationToken = jwt.sign(
      {
        userId: createdUser.id,
        type: 'email_verification',
      },
      getJwtSecret(),
      {
        expiresIn: '1d',
      },
    );

    const hasSmtp = Boolean(
      process.env.SMTP_HOST || (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD),
    );
    if (hasSmtp) {
      try {
        await this.emailService.sendWelcomeEmail(
          createdUser.email,
          createdUser.name,
          verificationToken,
        );
      } catch (error) {
        console.error(
          '[RegisterUseCase] Failed to send welcome email:',
          error instanceof Error ? error.message : error,
        );
      }
    }

    return createdUser;
  }
}
