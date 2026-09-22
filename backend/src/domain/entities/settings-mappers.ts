import { randomUUID } from 'node:crypto';
import type { Settings as PrismaSettings } from '@prisma/client';
import { type SettingsFields, toTablesViewMode } from './settings-config';

export type SettingsCreateProps = Omit<
  PrismaSettings,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'tablesViewMode'
  | 'emailIngestionEnabled'
  | 'openMeteoEnabled'
  | 'qdcSyncEnabled'
> & {
  readonly tablesViewMode?: string | null;
  readonly emailIngestionEnabled?: boolean;
  readonly openMeteoEnabled?: boolean;
  readonly qdcSyncEnabled?: boolean;
};

export function createSettingsFields(props: SettingsCreateProps): SettingsFields {
  const now = new Date();
  return {
    id: randomUUID(),
    userId: props.userId,
    language: props.language,
    qdcApiKey: props.qdcApiKey ?? null,
    ifarmingApiKey: props.ifarmingApiKey ?? null,
    tablesViewMode: toTablesViewMode(props.tablesViewMode),
    whatsappInstanceName: props.whatsappInstanceName ?? null,
    whatsappApiKey: props.whatsappApiKey ?? null,
    whatsappInstanceId: props.whatsappInstanceId ?? null,
    whatsappConnected: props.whatsappConnected ?? false,
    whatsappPhoneNumber: props.whatsappPhoneNumber ?? null,
    whatsappQrCode: props.whatsappQrCode ?? null,
    whatsappLastSync: props.whatsappLastSync ?? null,
    whatsappAllowedNumbers: props.whatsappAllowedNumbers ?? [],
    emailIngestionEnabled: props.emailIngestionEnabled ?? false,
    openMeteoEnabled: props.openMeteoEnabled ?? false,
    qdcSyncEnabled: props.qdcSyncEnabled ?? false,
    createdAt: now,
    updatedAt: now,
  };
}

export function settingsFieldsFromPrisma(settings: PrismaSettings): SettingsFields {
  return {
    id: settings.id,
    userId: settings.userId,
    language: settings.language,
    qdcApiKey: settings.qdcApiKey ?? null,
    ifarmingApiKey: settings.ifarmingApiKey ?? null,
    tablesViewMode: toTablesViewMode(settings.tablesViewMode),
    whatsappInstanceName: settings.whatsappInstanceName ?? null,
    whatsappApiKey: settings.whatsappApiKey ?? null,
    whatsappInstanceId: settings.whatsappInstanceId ?? null,
    whatsappConnected: settings.whatsappConnected ?? false,
    whatsappPhoneNumber: settings.whatsappPhoneNumber ?? null,
    whatsappQrCode: settings.whatsappQrCode ?? null,
    whatsappLastSync: settings.whatsappLastSync ?? null,
    whatsappAllowedNumbers: settings.whatsappAllowedNumbers ?? [],
    emailIngestionEnabled: settings.emailIngestionEnabled ?? false,
    openMeteoEnabled: settings.openMeteoEnabled ?? false,
    qdcSyncEnabled: settings.qdcSyncEnabled ?? false,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
}
