import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { ISettingsRepository } from '../../../domain/repositories/ISettingsRepository';
import { User } from '../../../domain/entities/User';
import { Settings } from '../../../domain/entities/Settings';
import { AppError } from '../../../domain/errors/AppError';

export interface UpdateUserProfileDTO {
  userId: string;
  data: {
    name?: string;
    surname?: string | null;
    fiscalCode?: string | null;
    companyName?: string | null;
    vatNumber?: string | null;
    phoneNumber?: string | null;
    address?: string | null;
    profilePictureUrl?: string | null;
    qdcApiKey?: string | null;
    ifarmingApiKey?: string | null;
  };
}

export interface UpdateUserProfileResult {
  user: User;
  qdcApiKey: string | null;
  ifarmingApiKey: string | null;
}

export class UpdateUserProfileUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly settingsRepository: ISettingsRepository,
  ) {}

  async execute({ userId, data }: UpdateUserProfileDTO): Promise<UpdateUserProfileResult> {
    const existingUser = await this.userRepository.findById(userId);
    if (!existingUser) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }

    const updatableUserFields: (keyof UpdateUserProfileDTO['data'])[] = [
      'name',
      'surname',
      'fiscalCode',
      'companyName',
      'vatNumber',
      'phoneNumber',
      'address',
      'profilePictureUrl',
    ];

    const filteredUserData: Partial<User> = {};
    for (const field of updatableUserFields) {
      if (Object.prototype.hasOwnProperty.call(data, field)) {
        // @ts-expect-error narrowing to Partial<User> properties compatible with repository
        filteredUserData[field] = data[field];
      }
    }

    const hasUserFields = Object.keys(filteredUserData).length > 0;
    const hasSettingsFields =
      Object.prototype.hasOwnProperty.call(data, 'qdcApiKey') ||
      Object.prototype.hasOwnProperty.call(data, 'ifarmingApiKey');

    if (!hasUserFields && !hasSettingsFields) {
      throw AppError.badRequest('No valid fields provided for update', 'NO_FIELDS_TO_UPDATE');
    }

    let updatedUser = existingUser;
    if (hasUserFields) {
      updatedUser = await this.userRepository.update(userId, filteredUserData);
    }

    let qdcApiKey: string | null = null;
    let ifarmingApiKey: string | null = null;

    if (hasSettingsFields) {
      const existingSettings = await this.settingsRepository.findByUserId(userId);
      if (existingSettings) {
        const updatedSettings = existingSettings.withUpdatedApiKeys({
          qdcApiKey: Object.prototype.hasOwnProperty.call(data, 'qdcApiKey')
            ? data.qdcApiKey
            : undefined,
          ifarmingApiKey: Object.prototype.hasOwnProperty.call(data, 'ifarmingApiKey')
            ? data.ifarmingApiKey
            : undefined,
        });
        const savedSettings = await this.settingsRepository.update(existingSettings.id, {
          qdcApiKey: updatedSettings.qdcApiKey,
          ifarmingApiKey: updatedSettings.ifarmingApiKey,
        });
        qdcApiKey = savedSettings.qdcApiKey;
        ifarmingApiKey = savedSettings.ifarmingApiKey;
      } else {
        const defaultLanguage = 'it';
        const qdcApiKeyValue = Object.prototype.hasOwnProperty.call(data, 'qdcApiKey')
          ? data.qdcApiKey ?? null
          : null;
        const ifarmingApiKeyValue = Object.prototype.hasOwnProperty.call(data, 'ifarmingApiKey')
          ? data.ifarmingApiKey ?? null
          : null;
        const newSettings = await this.settingsRepository.create(
          Settings.create({
            userId,
            language: defaultLanguage,
            qdcApiKey: qdcApiKeyValue,
            ifarmingApiKey: ifarmingApiKeyValue,
            whatsappInstanceName: null,
            whatsappApiKey: null,
            whatsappInstanceId: null,
            whatsappConnected: false,
            whatsappPhoneNumber: null,
            whatsappQrCode: null,
            whatsappLastSync: null,
            whatsappAllowedNumbers: [],
          }),
        );
        qdcApiKey = newSettings.qdcApiKey;
        ifarmingApiKey = newSettings.ifarmingApiKey;
      }
    } else {
      const existingSettings = await this.settingsRepository.findByUserId(userId);
      if (existingSettings) {
        qdcApiKey = existingSettings.qdcApiKey;
        ifarmingApiKey = existingSettings.ifarmingApiKey;
      }
    }

    return {
      user: updatedUser,
      qdcApiKey,
      ifarmingApiKey,
    };
  }
}
