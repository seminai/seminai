import { User } from '../../../domain/entities/User';
import { AppError } from '../../../domain/errors/AppError';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';

interface SetUserBlockedStatusDTO {
  readonly adminUserId: string;
  readonly targetUserId: string;
  readonly isBlocked: boolean;
  readonly reason?: string;
}

export class SetUserBlockedStatusUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute({
    adminUserId,
    targetUserId,
    isBlocked,
    reason,
  }: SetUserBlockedStatusDTO): Promise<User> {
    if (adminUserId === targetUserId) {
      throw AppError.badRequest(
        'You cannot update your own admin status',
        'SELF_ACTION_NOT_ALLOWED',
      );
    }
    const targetUser = await this.userRepository.findById(targetUserId);
    if (!targetUser) {
      throw AppError.notFound('Target user not found', 'TARGET_USER_NOT_FOUND');
    }
    return this.userRepository.update(targetUserId, {
      isBlocked,
      blockedAt: isBlocked ? new Date() : null,
      blockedReason: isBlocked ? reason ?? 'Blocked by admin dashboard' : null,
    });
  }
}
