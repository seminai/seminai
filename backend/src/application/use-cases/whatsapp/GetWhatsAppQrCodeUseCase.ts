import { ISettingsRepository } from '../../../domain/repositories/ISettingsRepository';
import { AppError } from '../../../domain/errors/AppError';
import {
  EvolutionApiService,
  EvolutionApiError,
} from '../../../infrastructure/services/whatsapp/EvolutionApiService';

export interface GetWhatsAppQrCodeInput {
  userId: string;
}

export interface GetWhatsAppQrCodeOutput {
  qrCode: string;
  qrCodeBase64: string;
  pairingCode: string | null;
}

/**
 * Use case for getting the WhatsApp QR code for connection.
 */
export class GetWhatsAppQrCodeUseCase {
  constructor(
    private readonly settingsRepository: ISettingsRepository,
    private readonly evolutionApi: EvolutionApiService,
  ) {}

  async execute(input: GetWhatsAppQrCodeInput): Promise<GetWhatsAppQrCodeOutput> {
    const settings = await this.settingsRepository.findByUserId(input.userId);

    if (!settings) {
      throw AppError.notFound('Settings not found for user', 'SETTINGS_NOT_FOUND');
    }

    if (!settings.whatsappInstanceName) {
      throw AppError.badRequest(
        'WhatsApp is not configured. Please setup WhatsApp first.',
        'WHATSAPP_NOT_CONFIGURED',
      );
    }

    if (settings.whatsappConnected) {
      throw AppError.badRequest('WhatsApp is already connected', 'WHATSAPP_ALREADY_CONNECTED');
    }

    try {
      const connectResponse = await this.evolutionApi.connectInstance(
        settings.whatsappInstanceName,
      );

      await this.settingsRepository.updateWhatsAppConfig(settings.id, {
        whatsappQrCode: connectResponse.base64,
        whatsappLastSync: new Date(),
      });

      return {
        qrCode: connectResponse.code,
        qrCodeBase64: connectResponse.base64,
        pairingCode: connectResponse.pairingCode,
      };
    } catch (error) {
      if (error instanceof EvolutionApiError) {
        throw AppError.badRequest(`Failed to get QR code: ${error.message}`, 'EVOLUTION_API_ERROR');
      }
      throw error;
    }
  }
}
