export enum WhatsAppConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  QR_CODE_READY = 'qr_code_ready',
}

export interface WhatsAppConfig {
  readonly instanceName: string | null;
  readonly apiKey: string | null;
  readonly instanceId: string | null;
  readonly connected: boolean;
  readonly phoneNumber: string | null;
  readonly qrCode: string | null;
  readonly lastSync: Date | null;
  readonly allowedNumbers: string[];
}

export const TABLES_VIEW_MODES = ['grid', 'excel'] as const;
export type TablesViewMode = (typeof TABLES_VIEW_MODES)[number];

export interface SettingsFields {
  readonly id: string;
  readonly userId: string;
  readonly language: string;
  readonly qdcApiKey: string | null;
  readonly ifarmingApiKey: string | null;
  readonly tablesViewMode: TablesViewMode;
  readonly whatsappInstanceName: string | null;
  readonly whatsappApiKey: string | null;
  readonly whatsappInstanceId: string | null;
  readonly whatsappConnected: boolean;
  readonly whatsappPhoneNumber: string | null;
  readonly whatsappQrCode: string | null;
  readonly whatsappLastSync: Date | null;
  readonly whatsappAllowedNumbers: string[];
  readonly emailIngestionEnabled: boolean;
  readonly openMeteoEnabled: boolean;
  readonly qdcSyncEnabled: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export function toTablesViewMode(value: string | null | undefined): TablesViewMode {
  return value === 'excel' ? 'excel' : 'grid';
}
