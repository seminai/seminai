import { INSTANCE_SETTING_KEYS } from '../../../infrastructure/settings/instanceSettingKeys';
import type { EncryptedSettingStore } from '../../../infrastructure/settings/encryptedSettingStore';
import type { SetupStatus } from './setupTypes';

export class GetSetupStatusUseCase {
  constructor(private readonly settings: EncryptedSettingStore) {}

  async execute(): Promise<SetupStatus> {
    const completed = await this.settings.get(INSTANCE_SETTING_KEYS.setupCompleted);
    return { completed: completed === 'true' };
  }
}
