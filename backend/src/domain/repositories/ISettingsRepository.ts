import { Settings } from '../entities/Settings';

export interface WhatsAppConfigUpdate {
  whatsappInstanceName?: string | null;
  whatsappApiKey?: string | null;
  whatsappInstanceId?: string | null;
  whatsappConnected?: boolean;
  whatsappPhoneNumber?: string | null;
  whatsappQrCode?: string | null;
  whatsappLastSync?: Date | null;
  whatsappAllowedNumbers?: string[];
}

export interface ISettingsRepository {
  create(settings: Settings): Promise<Settings>;
  findById(id: string): Promise<Settings | null>;
  findByUserId(userId: string): Promise<Settings | null>;
  findByWhatsappInstanceName(instanceName: string): Promise<Settings | null>;
  update(id: string, settings: Partial<Settings>): Promise<Settings>;
  updateWhatsAppConfig(id: string, whatsappConfig: WhatsAppConfigUpdate): Promise<Settings>;
  updateEmailIngestionEnabled(id: string, enabled: boolean): Promise<Settings>;
  updateOpenMeteoEnabled(id: string, enabled: boolean): Promise<Settings>;
  updateQdcSyncEnabled(id: string, enabled: boolean): Promise<Settings>;
  delete(id: string): Promise<void>;
}
