import { PrismaClient } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';

export interface DeleteUserCacheDTO {
  userId: string;
}

export interface DeleteUserCacheResult {
  deletedCount: number;
}

export class DeleteUserCacheUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly prisma: PrismaClient,
  ) {}

  async execute({ userId }: DeleteUserCacheDTO): Promise<DeleteUserCacheResult> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }
    const result = await this.prisma.llmCacheEntry.deleteMany({
      where: {
        userId,
      },
    });
    return {
      deletedCount: result.count,
    };
  }
}
