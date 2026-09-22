import { prisma } from '../repositories/Prisma';
import { InstanceSettingStore } from './InstanceSettingStore';
import type { EncryptedSettingStore } from './encryptedSettingStore';

let store: EncryptedSettingStore | undefined;

export function getInstanceSettingStore(): EncryptedSettingStore {
  if (!store) {
    store = new InstanceSettingStore(prisma.instanceSetting);
  }
  return store;
}

export function resetInstanceSettingStoreCache(): void {
  store?.invalidate();
}

/** Loads completed setup values into process.env when the environment is empty. */
export async function applyPersistedInstanceSettings(): Promise<void> {
  try {
    await getInstanceSettingStore().applyOverridesToEnv();
  } catch (error) {
    console.warn(
      '[instance-settings] skipped apply',
      error instanceof Error ? error.message : error,
    );
  }
}
