import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { ISettingsRepository } from '../../../domain/repositories/ISettingsRepository';
import { User } from '../../../domain/entities/User';
import { AppError } from '../../../domain/errors/AppError';

export interface GetUserProfileDTO {
  userId: string;
}

export interface GetUserProfileResult {
  user: User;
  qdcApiKey: string | null;
  ifarmingApiKey: string | null;
}

export class GetUserProfileUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly settingsRepository: ISettingsRepository,
  ) {}

  async execute({ userId }: GetUserProfileDTO): Promise<GetUserProfileResult> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }
    const settings = await this.settingsRepository.findByUserId(userId);
    return {
      user,
      qdcApiKey: settings?.qdcApiKey ?? null,
      ifarmingApiKey: settings?.ifarmingApiKey ?? null,
    };
  }
}
