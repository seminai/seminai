import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { AppError } from '../../../domain/errors/AppError';

interface ResetPasswordDTO {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

interface TokenPayload {
  userId: string;
  type: string;
  iat: number;
  exp: number;
}

export class ResetPasswordUseCase {
  constructor(private userRepository: IUserRepository) {}

  async execute({ token, newPassword, confirmPassword }: ResetPasswordDTO): Promise<void> {
    if (newPassword !== confirmPassword) {
      throw AppError.badRequest('New password and confirmation do not match', 'PASSWORD_MISMATCH');
    }
    if (newPassword.length < 6) {
      throw AppError.badRequest(
        'New password must be at least 6 characters long',
        'PASSWORD_TOO_SHORT',
      );
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret') as TokenPayload;

      if (decoded.type !== 'password_reset') {
        throw AppError.badRequest('Invalid token type', 'INVALID_TOKEN_TYPE');
      }

      const user = await this.userRepository.findById(decoded.userId);

      if (!user) {
        throw AppError.badRequest('Invalid or expired reset token', 'INVALID_TOKEN');
      }

      const hashedNewPassword = await bcrypt.hash(newPassword, 8);

      await this.userRepository.update(user.id, {
        password: hashedNewPassword,
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw AppError.badRequest('Invalid or expired reset token', 'INVALID_TOKEN');
    }
  }
}
