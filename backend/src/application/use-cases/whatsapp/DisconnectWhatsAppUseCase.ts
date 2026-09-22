import { ISettingsRepository } from '../../../domain/repositories/ISettingsRepository';
import { AppError } from '../../../domain/errors/AppError';
import {
  EvolutionApiService,
  EvolutionApiError,
} from '../../../infrastructure/services/whatsapp/EvolutionApiService';

export interface DisconnectWhatsAppInput {
  userId: string;
  deleteInstance?: boolean;
}

export interface DisconnectWhatsAppOutput {
  success: boolean;
  message: string;
}

/**
 * Use case for disconnecting WhatsApp.
 * Can either just logout (keep instance) or completely delete the instance.
 */
export class DisconnectWhatsAppUseCase {
  constructor(
    private readonly settingsRepository: ISettingsRepository,
    private readonly evolutionApi: EvolutionApiService,
  ) {}

  async execute(input: DisconnectWhatsAppInput): Promise<DisconnectWhatsAppOutput> {
    const settings = await this.settingsRepository.findByUserId(input.userId);

    if (!settings) {
      throw AppError.notFound('Settings not found for user', 'SETTINGS_NOT_FOUND');
    }

    if (!settings.whatsappInstanceName) {
      throw AppError.badRequest('WhatsApp is not configured', 'WHATSAPP_NOT_CONFIGURED');
    }

    try {
      if (input.deleteInstance) {
        await this.evolutionApi.deleteInstance(settings.whatsappInstanceName);

        await this.settingsRepository.updateWhatsAppConfig(settings.id, {
          whatsappInstanceName: null,
          whatsappApiKey: null,
          whatsappInstanceId: null,
          whatsappConnected: false,
          whatsappPhoneNumber: null,
          whatsappQrCode: null,
          whatsappLastSync: null,
        });

        return {
          success: true,
          message: 'WhatsApp instance deleted successfully',
        };
      }

      await this.evolutionApi.logoutInstance(settings.whatsappInstanceName);

      await this.settingsRepository.updateWhatsAppConfig(settings.id, {
        whatsappConnected: false,
        whatsappPhoneNumber: null,
        whatsappQrCode: null,
        whatsappLastSync: new Date(),
      });

      return {
        success: true,
        message: 'WhatsApp disconnected successfully',
      };
    } catch (error) {
      if (error instanceof EvolutionApiError) {
        if (error.statusCode === 404) {
          await this.settingsRepository.updateWhatsAppConfig(settings.id, {
            whatsappConnected: false,
            whatsappQrCode: null,
          });

          return {
            success: true,
            message: 'WhatsApp instance not found, settings cleared',
          };
        }

        throw AppError.badRequest(
          `Failed to disconnect WhatsApp: ${error.message}`,
          'EVOLUTION_API_ERROR',
        );
      }
      throw error;
    }
  }
}
