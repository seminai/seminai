import bcrypt from 'bcryptjs';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { AppError } from '../../../domain/errors/AppError';
import { User } from '../../../domain/entities/User';

interface UpdatePasswordDTO {
  userId: string;
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export class UpdatePasswordUseCase {
  constructor(private userRepository: IUserRepository) {}

  async execute({
    userId,
    oldPassword,
    newPassword,
    confirmPassword,
  }: UpdatePasswordDTO): Promise<User> {
    if (newPassword !== confirmPassword) {
      throw AppError.badRequest('New password and confirmation do not match', 'PASSWORD_MISMATCH');
    }
    if (newPassword.length < 6) {
      throw AppError.badRequest(
        'New password must be at least 6 characters long',
        'PASSWORD_TOO_SHORT',
      );
    }
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }
    if (!user.password) {
      throw AppError.badRequest(
        'This account uses Google login and has no password. Use Google to sign in.',
        'GOOGLE_ONLY_ACCOUNT',
      );
    }
    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldPasswordValid) {
      throw AppError.unauthorized('Old password is incorrect', 'INVALID_OLD_PASSWORD');
    }
    const hashedNewPassword = await bcrypt.hash(newPassword, 8);
    const updatedUser = await this.userRepository.update(userId, {
      password: hashedNewPassword,
    });
    return updatedUser;
  }
}
