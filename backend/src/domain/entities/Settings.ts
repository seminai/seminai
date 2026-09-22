import {
  type SettingsFields,
  type TablesViewMode,
  type WhatsAppConfig,
  WhatsAppConnectionStatus,
} from './settings-config';
import {
  createSettingsFields,
  settingsFieldsFromPrisma,
  type SettingsCreateProps,
} from './settings-mappers';

export {
  TABLES_VIEW_MODES,
  type TablesViewMode,
  type WhatsAppConfig,
  WhatsAppConnectionStatus,
} from './settings-config';

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
  static create(props: SettingsCreateProps): Settings {
    return new Settings(createSettingsFields(props));
  }

  /**
   * Map a Prisma Settings model instance to the domain entity.
   */
  static fromPrisma(prismaSettings: Parameters<typeof settingsFieldsFromPrisma>[0]): Settings {
    return new Settings(settingsFieldsFromPrisma(prismaSettings));
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
