import { User } from '../../../domain/entities/User';
import { AppError } from '../../../domain/errors/AppError';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';

interface ReactivateUserDTO {
  readonly adminUserId: string;
  readonly targetUserId: string;
}

export class ReactivateUserUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute({ adminUserId, targetUserId }: ReactivateUserDTO): Promise<User> {
    if (adminUserId === targetUserId) {
      throw AppError.badRequest(
        'You cannot reactivate your own account from admin dashboard',
        'SELF_ACTION_NOT_ALLOWED',
      );
    }
    const targetUser = await this.userRepository.findById(targetUserId);
    if (!targetUser) {
      throw AppError.notFound('Target user not found', 'TARGET_USER_NOT_FOUND');
    }
    return this.userRepository.update(targetUserId, {
      isDeactivated: false,
      deactivatedAt: null,
      deactivatedReason: null,
      isBlocked: false,
      blockedAt: null,
      blockedReason: null,
    });
  }
}
