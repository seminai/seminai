export interface InstanceSettingRow {
  readonly key: string;
  readonly valueEnc: string;
}

export interface InstanceSettingDelegate {
  findMany(): Promise<InstanceSettingRow[]>;
  findUnique(args: { where: { key: string } }): Promise<InstanceSettingRow | null>;
  upsert(args: {
    where: { key: string };
    create: { key: string; valueEnc: string };
    update: { valueEnc: string };
  }): Promise<InstanceSettingRow>;
}

export interface EncryptedSettingStore {
  get(key: string, fallback?: string): Promise<string>;
  set(key: string, plaintext: string): Promise<void>;
  invalidate(key?: string): void;
  applyOverridesToEnv(env?: Record<string, string | undefined>): Promise<void>;
}
