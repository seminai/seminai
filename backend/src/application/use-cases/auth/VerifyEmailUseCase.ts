import jwt from 'jsonwebtoken';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { AppError } from '../../../domain/errors/AppError';

interface VerifyEmailDTO {
  token: string;
}

interface TokenPayload {
  userId: string;
  type: string;
  iat: number;
  exp: number;
}

export class VerifyEmailUseCase {
  constructor(private userRepository: IUserRepository) {}

  async execute({ token }: VerifyEmailDTO): Promise<void> {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret') as TokenPayload;

      if (decoded.type !== 'email_verification') {
        throw AppError.badRequest('Invalid token type', 'INVALID_TOKEN_TYPE');
      }

      const user = await this.userRepository.findById(decoded.userId);

      if (!user) {
        throw AppError.notFound('User not found', 'USER_NOT_FOUND');
      }

      await this.userRepository.update(user.id, {
        ...user,
        emailVerified: true,
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw AppError.badRequest('Invalid or expired verification token', 'INVALID_TOKEN');
    }
  }
}
