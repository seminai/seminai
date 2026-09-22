import { ISettingsRepository } from '../../../domain/repositories/ISettingsRepository';
import { AppError } from '../../../domain/errors/AppError';
import { WhatsAppConnectionStatus } from '../../../domain/entities/Settings';
import { EvolutionApiService } from '../../../infrastructure/services/whatsapp/EvolutionApiService';

export interface GetWhatsAppStatusInput {
  userId: string;
}

export interface GetWhatsAppStatusOutput {
  configured: boolean;
  connected: boolean;
  status: WhatsAppConnectionStatus;
  instanceName: string | null;
  phoneNumber: string | null;
  lastSync: Date | null;
  evolutionState?: 'open' | 'close' | 'connecting';
  qrCodeBase64?: string | null;
}

/**
 * Use case for getting the current WhatsApp connection status.
 */
export class GetWhatsAppStatusUseCase {
  constructor(
    private readonly settingsRepository: ISettingsRepository,
    private readonly evolutionApi: EvolutionApiService,
  ) {}

  async execute(input: GetWhatsAppStatusInput): Promise<GetWhatsAppStatusOutput> {
    const settings = await this.settingsRepository.findByUserId(input.userId);

    if (!settings) {
      throw AppError.notFound('Settings not found for user', 'SETTINGS_NOT_FOUND');
    }

    if (!settings.whatsappInstanceName) {
      return {
        configured: false,
        connected: false,
        status: WhatsAppConnectionStatus.DISCONNECTED,
        instanceName: null,
        phoneNumber: null,
        lastSync: null,
        qrCodeBase64: null,
      };
    }

    try {
      const connectionState = await this.evolutionApi.getConnectionState(
        settings.whatsappInstanceName,
      );

      const isConnected = connectionState.instance.state === 'open';

      if (isConnected !== settings.whatsappConnected) {
        await this.settingsRepository.updateWhatsAppConfig(settings.id, {
          whatsappConnected: isConnected,
          whatsappLastSync: new Date(),
        });
      }

      // Re-read settings to get the most recent QR code (handles race conditions)
      const freshSettings = await this.settingsRepository.findByUserId(input.userId);
      const currentQrCode = freshSettings?.whatsappQrCode || settings.whatsappQrCode;

      let status: WhatsAppConnectionStatus;
      if (isConnected) {
        status = WhatsAppConnectionStatus.CONNECTED;
      } else if (connectionState.instance.state === 'connecting') {
        status = WhatsAppConnectionStatus.CONNECTING;
      } else if (currentQrCode) {
        status = WhatsAppConnectionStatus.QR_CODE_READY;
      } else {
        status = WhatsAppConnectionStatus.DISCONNECTED;
      }

      return {
        configured: true,
        connected: isConnected,
        status,
        instanceName: settings.whatsappInstanceName,
        phoneNumber: freshSettings?.whatsappPhoneNumber || settings.whatsappPhoneNumber,
        lastSync: new Date(),
        evolutionState: connectionState.instance.state,
        qrCodeBase64: isConnected ? null : currentQrCode,
      };
    } catch (error) {
      // If Evolution API fails, fall back to local state
      // This ensures the frontend always gets a valid response and doesn't hide the QR code
      console.warn(
        `[GetWhatsAppStatus] Failed to get status from Evolution API, using local state`,
      );

      // Re-read settings from database to get the most recent data
      // This handles race conditions where setup is still saving the QR code
      const freshSettings = await this.settingsRepository.findByUserId(input.userId);
      const currentSettings = freshSettings || settings;

      return {
        configured: true,
        connected: currentSettings.whatsappConnected,
        status: currentSettings.whatsappConnected
          ? WhatsAppConnectionStatus.CONNECTED
          : currentSettings.whatsappQrCode
            ? WhatsAppConnectionStatus.QR_CODE_READY
            : WhatsAppConnectionStatus.DISCONNECTED,
        instanceName: currentSettings.whatsappInstanceName,
        phoneNumber: currentSettings.whatsappPhoneNumber,
        lastSync: currentSettings.whatsappLastSync,
        evolutionState: currentSettings.whatsappConnected ? 'open' : 'close',
        qrCodeBase64: currentSettings.whatsappConnected ? null : currentSettings.whatsappQrCode,
      };
    }
  }
}
