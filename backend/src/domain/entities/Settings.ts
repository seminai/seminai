import { randomUUID } from 'node:crypto';
import { Settings as PrismaSettings } from '@prisma/client';

/**
 * WhatsApp connection status enum.
 */
export enum WhatsAppConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  QR_CODE_READY = 'qr_code_ready',
}

/**
 * WhatsApp configuration interface.
 */
export interface WhatsAppConfig {
  instanceName: string | null;
  apiKey: string | null;
  instanceId: string | null;
  connected: boolean;
  phoneNumber: string | null;
  qrCode: string | null;
  lastSync: Date | null;
  allowedNumbers: string[];
}

/**
 * Allowed values for the user preference that switches between the classic
 * React data-table and the Excel-like AG Grid view.
 */
export const TABLES_VIEW_MODES = ['grid', 'excel'] as const;
export type TablesViewMode = (typeof TABLES_VIEW_MODES)[number];

interface SettingsFields {
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

function toTablesViewMode(value: string | null | undefined): TablesViewMode {
  return value === 'excel' ? 'excel' : 'grid';
}

/**
 * Domain entity representing application settings associated to a specific user.
 */
export class Settings {
  public readonly id: string;
  public readonly userId: string;
  public readonly language: string;
  public readonly qdcApiKey: string | null;
  public readonly ifarmingApiKey: string | null;
  public readonly tablesViewMode: TablesViewMode;
  public readonly whatsappInstanceName: string | null;
  public readonly whatsappApiKey: string | null;
  public readonly whatsappInstanceId: string | null;
  public readonly whatsappConnected: boolean;
  public readonly whatsappPhoneNumber: string | null;
  public readonly whatsappQrCode: string | null;
  public readonly whatsappLastSync: Date | null;
  public readonly whatsappAllowedNumbers: string[];
  public readonly emailIngestionEnabled: boolean;
  public readonly openMeteoEnabled: boolean;
  public readonly qdcSyncEnabled: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(fields: SettingsFields) {
    this.id = fields.id;
    this.userId = fields.userId;
    this.language = fields.language;
    this.qdcApiKey = fields.qdcApiKey;
    this.ifarmingApiKey = fields.ifarmingApiKey;
    this.tablesViewMode = fields.tablesViewMode;
    this.whatsappInstanceName = fields.whatsappInstanceName;
    this.whatsappApiKey = fields.whatsappApiKey;
    this.whatsappInstanceId = fields.whatsappInstanceId;
    this.whatsappConnected = fields.whatsappConnected;
    this.whatsappPhoneNumber = fields.whatsappPhoneNumber;
    this.whatsappQrCode = fields.whatsappQrCode;
    this.whatsappLastSync = fields.whatsappLastSync;
    this.whatsappAllowedNumbers = fields.whatsappAllowedNumbers;
    this.emailIngestionEnabled = fields.emailIngestionEnabled;
    this.openMeteoEnabled = fields.openMeteoEnabled;
    this.qdcSyncEnabled = fields.qdcSyncEnabled;
    this.createdAt = fields.createdAt;
    this.updatedAt = fields.updatedAt;
  }

  /**
   * Create a new Settings domain entity from raw properties.
   * tablesViewMode defaults to 'grid' when not provided.
   */
  static create(
    props: Omit<
      PrismaSettings,
      | 'id'
      | 'createdAt'
      | 'updatedAt'
      | 'tablesViewMode'
      | 'emailIngestionEnabled'
      | 'openMeteoEnabled'
      | 'qdcSyncEnabled'
    > & {
      tablesViewMode?: string | null;
      emailIngestionEnabled?: boolean;
      openMeteoEnabled?: boolean;
      qdcSyncEnabled?: boolean;
    },
  ): Settings {
    const now = new Date();
    return new Settings({
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
    });
  }

  /**
   * Map a Prisma Settings model instance to the domain entity.
   */
  static fromPrisma(prismaSettings: PrismaSettings): Settings {
    return new Settings({
      id: prismaSettings.id,
      userId: prismaSettings.userId,
      language: prismaSettings.language,
      qdcApiKey: prismaSettings.qdcApiKey ?? null,
      ifarmingApiKey: prismaSettings.ifarmingApiKey ?? null,
      tablesViewMode: toTablesViewMode(prismaSettings.tablesViewMode),
      whatsappInstanceName: prismaSettings.whatsappInstanceName ?? null,
      whatsappApiKey: prismaSettings.whatsappApiKey ?? null,
      whatsappInstanceId: prismaSettings.whatsappInstanceId ?? null,
      whatsappConnected: prismaSettings.whatsappConnected ?? false,
      whatsappPhoneNumber: prismaSettings.whatsappPhoneNumber ?? null,
      whatsappQrCode: prismaSettings.whatsappQrCode ?? null,
      whatsappLastSync: prismaSettings.whatsappLastSync ?? null,
      whatsappAllowedNumbers: prismaSettings.whatsappAllowedNumbers ?? [],
      emailIngestionEnabled: prismaSettings.emailIngestionEnabled ?? false,
      openMeteoEnabled: prismaSettings.openMeteoEnabled ?? false,
      qdcSyncEnabled: prismaSettings.qdcSyncEnabled ?? false,
      createdAt: prismaSettings.createdAt,
      updatedAt: prismaSettings.updatedAt,
    });
  }

  /**
   * Check if a phone number is in the WhatsApp allowlist.
   * If the allowlist is empty, ALL numbers are allowed (backward-compatible).
   */
  isPhoneNumberAllowed(phoneNumber: string): boolean {
    if (this.whatsappAllowedNumbers.length === 0) return true;
    return this.whatsappAllowedNumbers.includes(phoneNumber);
  }

  hasQdcApiKey(): boolean {
    return Boolean(this.qdcApiKey);
  }

  hasIFarmingApiKey(): boolean {
    return Boolean(this.ifarmingApiKey);
  }

  isLanguage(language: string): boolean {
    return this.language === language;
  }

  hasWhatsAppConfigured(): boolean {
    return Boolean(this.whatsappInstanceName && this.whatsappApiKey);
  }

  isWhatsAppConnected(): boolean {
    return this.whatsappConnected;
  }

  /**
   * Get the WhatsApp connection status.
   */
  getWhatsAppConnectionStatus(): WhatsAppConnectionStatus {
    if (!this.hasWhatsAppConfigured()) {
      return WhatsAppConnectionStatus.DISCONNECTED;
    }
    if (this.whatsappQrCode && !this.whatsappConnected) {
      return WhatsAppConnectionStatus.QR_CODE_READY;
    }
    if (this.whatsappConnected) {
      return WhatsAppConnectionStatus.CONNECTED;
    }
    return WhatsAppConnectionStatus.DISCONNECTED;
  }

  getWhatsAppConfig(): WhatsAppConfig {
    return {
      instanceName: this.whatsappInstanceName,
      apiKey: this.whatsappApiKey,
      instanceId: this.whatsappInstanceId,
      connected: this.whatsappConnected,
      phoneNumber: this.whatsappPhoneNumber,
      qrCode: this.whatsappQrCode,
      lastSync: this.whatsappLastSync,
      allowedNumbers: this.whatsappAllowedNumbers,
    };
  }

  /**
   * Internal helper that returns a clone with the specified field overrides
   * and a refreshed updatedAt. Keeps all "withX" methods small and DRY.
   */
  private cloneWith(override: Partial<SettingsFields>): Settings {
    return new Settings({
      id: this.id,
      userId: this.userId,
      language: this.language,
      qdcApiKey: this.qdcApiKey,
      ifarmingApiKey: this.ifarmingApiKey,
      tablesViewMode: this.tablesViewMode,
      whatsappInstanceName: this.whatsappInstanceName,
      whatsappApiKey: this.whatsappApiKey,
      whatsappInstanceId: this.whatsappInstanceId,
      whatsappConnected: this.whatsappConnected,
      whatsappPhoneNumber: this.whatsappPhoneNumber,
      whatsappQrCode: this.whatsappQrCode,
      whatsappLastSync: this.whatsappLastSync,
      whatsappAllowedNumbers: this.whatsappAllowedNumbers,
      emailIngestionEnabled: this.emailIngestionEnabled,
      openMeteoEnabled: this.openMeteoEnabled,
      qdcSyncEnabled: this.qdcSyncEnabled,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      ...override,
    });
  }

  /**
   * Whether inbound emails sent from this user's address should be processed
   * by dosage_agent_react. Default is `false` (opt-in).
   */
  isEmailIngestionEnabled(): boolean {
    return this.emailIngestionEnabled;
  }

  withEmailIngestionEnabled(enabled: boolean): Settings {
    return this.cloneWith({ emailIngestionEnabled: enabled });
  }

  /**
   * Whether the Open-Meteo weather forecast integration is enabled. When `true`,
   * the dosage_agent_react can invoke weather tools (forecast + treatment window
   * evaluator). Default is `false` (opt-in).
   */
  isOpenMeteoEnabled(): boolean {
    return this.openMeteoEnabled;
  }

  withOpenMeteoEnabled(enabled: boolean): Settings {
    return this.cloneWith({ openMeteoEnabled: enabled });
  }

  /**
   * Whether the nightly QDC (Quaderno di Campagna) mirror sync is enabled for
   * this user. The cron runs when at least one user opted in. Default `false`.
   */
  isQdcSyncEnabled(): boolean {
    return this.qdcSyncEnabled;
  }

  withQdcSyncEnabled(enabled: boolean): Settings {
    return this.cloneWith({ qdcSyncEnabled: enabled });
  }

  withUpdatedApiKeys(update: {
    qdcApiKey?: string | null;
    ifarmingApiKey?: string | null;
  }): Settings {
    return this.cloneWith({
      qdcApiKey: update.qdcApiKey ?? this.qdcApiKey,
      ifarmingApiKey: update.ifarmingApiKey ?? this.ifarmingApiKey,
    });
  }

  withLanguage(language: string): Settings {
    return this.cloneWith({ language });
  }

  /**
   * Return a new Settings instance with the preferred tables view mode.
   */
  withTablesViewMode(tablesViewMode: TablesViewMode): Settings {
    return this.cloneWith({ tablesViewMode });
  }

  withWhatsAppConfig(config: Partial<WhatsAppConfig>): Settings {
    return this.cloneWith({
      whatsappInstanceName:
        config.instanceName !== undefined ? config.instanceName : this.whatsappInstanceName,
      whatsappApiKey: config.apiKey !== undefined ? config.apiKey : this.whatsappApiKey,
      whatsappInstanceId:
        config.instanceId !== undefined ? config.instanceId : this.whatsappInstanceId,
      whatsappConnected: config.connected !== undefined ? config.connected : this.whatsappConnected,
      whatsappPhoneNumber:
        config.phoneNumber !== undefined ? config.phoneNumber : this.whatsappPhoneNumber,
      whatsappQrCode: config.qrCode !== undefined ? config.qrCode : this.whatsappQrCode,
      whatsappLastSync: config.lastSync !== undefined ? config.lastSync : this.whatsappLastSync,
      whatsappAllowedNumbers:
        config.allowedNumbers !== undefined ? config.allowedNumbers : this.whatsappAllowedNumbers,
    });
  }

  withWhatsAppDisconnected(): Settings {
    return this.cloneWith({
      whatsappConnected: false,
      whatsappPhoneNumber: null,
      whatsappQrCode: null,
      whatsappLastSync: null,
    });
  }

  withWhatsAppRemoved(): Settings {
    return this.cloneWith({
      whatsappInstanceName: null,
      whatsappApiKey: null,
      whatsappInstanceId: null,
      whatsappConnected: false,
      whatsappPhoneNumber: null,
      whatsappQrCode: null,
      whatsappLastSync: null,
      whatsappAllowedNumbers: [],
    });
  }
}
