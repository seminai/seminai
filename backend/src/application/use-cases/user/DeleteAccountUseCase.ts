import { AppError } from '../../../domain/errors/AppError';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';

interface DeleteAccountDTO {
  readonly userId: string;
  readonly reason?: string;
}

/**
 * Soft-deletes the authenticated user's own account by flipping the
 * `isDeactivated` flag. All auth entry points reject deactivated users,
 * so the existing token is invalidated on the next request and future
 * logins are rejected without marking the account as blocked.
 */
export class DeleteAccountUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute({ userId, reason }: DeleteAccountDTO): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }
    if (user.isDeactivated) {
      return;
    }
    const now = new Date();
    await this.userRepository.update(userId, {
      isDeactivated: true,
      deactivatedAt: now,
      deactivatedReason: reason ?? 'Account deleted by user',
    });
  }
}
