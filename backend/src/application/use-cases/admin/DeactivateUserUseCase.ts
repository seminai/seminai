import { User } from '../../../domain/entities/User';
import { AppError } from '../../../domain/errors/AppError';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';

interface DeactivateUserDTO {
  readonly adminUserId: string;
  readonly targetUserId: string;
  readonly reason?: string;
}

export class DeactivateUserUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute({ adminUserId, targetUserId, reason }: DeactivateUserDTO): Promise<User> {
    if (adminUserId === targetUserId) {
      throw AppError.badRequest(
        'You cannot deactivate your own account',
        'SELF_ACTION_NOT_ALLOWED',
      );
    }
    const targetUser = await this.userRepository.findById(targetUserId);
    if (!targetUser) {
      throw AppError.notFound('Target user not found', 'TARGET_USER_NOT_FOUND');
    }
    return this.userRepository.update(targetUserId, {
      isDeactivated: true,
      deactivatedAt: new Date(),
      deactivatedReason: reason ?? 'Deactivated by admin dashboard',
    });
  }
}
