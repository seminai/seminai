import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { AppError } from '../../../domain/errors/AppError';
import { User } from '../../../domain/entities/User';

interface DeductUserCreditsDTO {
  userId: string;
  amount: number;
}

export class DeductUserCreditsUseCase {
  constructor(private userRepository: IUserRepository) {}

  async execute({ userId, amount }: DeductUserCreditsDTO): Promise<User> {
    if (amount < 0) {
      throw AppError.badRequest('Amount must be positive', 'INVALID_AMOUNT');
    }
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }
    if (user.credits < amount) {
      throw AppError.badRequest(
        `Insufficient credits. Available: ${user.credits}, Required: ${amount}`,
        'INSUFFICIENT_CREDITS',
      );
    }
    const updatedUser = await this.userRepository.deductCredits(userId, amount);
    return updatedUser;
  }
}
