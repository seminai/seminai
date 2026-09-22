import { ISettingsRepository } from '../../../domain/repositories/ISettingsRepository';
import { AppError } from '../../../domain/errors/AppError';
import {
  EvolutionApiService,
  EvolutionApiError,
} from '../../../infrastructure/services/whatsapp/EvolutionApiService';

export interface SendWhatsAppMessageInput {
  userId: string;
  phoneNumber: string;
  message: string;
}

export interface SendWhatsAppMessageOutput {
  success: boolean;
  messageId: string;
  timestamp: string;
}

/**
 * Use case for sending a WhatsApp message.
 */
export class SendWhatsAppMessageUseCase {
  constructor(
    private readonly settingsRepository: ISettingsRepository,
    private readonly evolutionApi: EvolutionApiService,
  ) {}

  async execute(input: SendWhatsAppMessageInput): Promise<SendWhatsAppMessageOutput> {
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

    if (!settings.whatsappConnected) {
      throw AppError.badRequest(
        'WhatsApp is not connected. Please scan the QR code first.',
        'WHATSAPP_NOT_CONNECTED',
      );
    }

    const normalizedNumber = this.normalizePhoneNumber(input.phoneNumber);

    try {
      const response = await this.evolutionApi.sendTextMessage(settings.whatsappInstanceName, {
        number: normalizedNumber,
        text: input.message,
      });

      return {
        success: true,
        messageId: response.key.id,
        timestamp: response.messageTimestamp,
      };
    } catch (error) {
      if (error instanceof EvolutionApiError) {
        throw AppError.badRequest(
          `Failed to send WhatsApp message: ${error.message}`,
          'EVOLUTION_API_ERROR',
        );
      }
      throw error;
    }
  }

  /**
   * Normalize phone number to international format.
   * Removes spaces, dashes, and adds country code if missing.
   */
  private normalizePhoneNumber(phoneNumber: string): string {
    let cleaned = phoneNumber.replace(/[\s\-\(\)]/g, '');

    if (cleaned.startsWith('+')) {
      cleaned = cleaned.substring(1);
    }

    if (cleaned.startsWith('00')) {
      cleaned = cleaned.substring(2);
    }

    if (cleaned.startsWith('0')) {
      cleaned = '39' + cleaned.substring(1);
    }

    if (cleaned.length <= 10) {
      cleaned = '39' + cleaned;
    }

    return cleaned;
  }
}
