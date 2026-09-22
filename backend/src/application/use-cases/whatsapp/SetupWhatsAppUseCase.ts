import { ISettingsRepository } from '../../../domain/repositories/ISettingsRepository';
import { AppError } from '../../../domain/errors/AppError';
import {
  EvolutionApiService,
  EvolutionApiError,
} from '../../../infrastructure/services/whatsapp/EvolutionApiService';

export interface SetupWhatsAppInput {
  userId: string;
  instanceName?: string;
  webhookUrl?: string;
}

export interface SetupWhatsAppOutput {
  instanceName: string;
  instanceId: string;
  apiKey: string;
  qrCode: string | null;
  qrCodeBase64: string | null;
  webhookConfigured: boolean;
}

/**
 * Webhook events to subscribe to for field note agent integration.
 */
// const WEBHOOK_EVENTS = ['messages.upsert', 'connection.update', 'qrcode.updated'];

/**
 * Use case for setting up WhatsApp integration.
 * Creates a new Evolution API instance, configures webhook, and stores configuration in settings.
 */
export class SetupWhatsAppUseCase {
  constructor(
    private readonly settingsRepository: ISettingsRepository,
    private readonly evolutionApi: EvolutionApiService,
  ) {}

  async execute(input: SetupWhatsAppInput): Promise<SetupWhatsAppOutput> {
    const settings = await this.settingsRepository.findByUserId(input.userId);

    if (!settings) {
      throw AppError.notFound('Settings not found for user', 'SETTINGS_NOT_FOUND');
    }

    if (settings.whatsappInstanceName && settings.whatsappConnected) {
      throw AppError.conflict(
        'WhatsApp is already configured and connected',
        'WHATSAPP_ALREADY_CONNECTED',
      );
    }

    const instanceName =
      input.instanceName || `seminai_${input.userId.substring(0, 8)}_${Date.now()}`;

    const existingInstance = await this.settingsRepository.findByWhatsappInstanceName(instanceName);
    if (existingInstance && existingInstance.id !== settings.id) {
      throw AppError.conflict('Instance name already in use', 'INSTANCE_NAME_TAKEN');
    }

    try {
      // Check if instance already exists on Evolution API
      // Note: fetchInstances with specific name returns 500 if instance doesn't exist
      // This is expected behavior, so we catch and ignore
      try {
        const existingInstances = await this.evolutionApi.fetchInstances(instanceName);
        if (existingInstances.length > 0) {
          // Instance exists, try to delete it first
          try {
            await this.evolutionApi.deleteInstance(instanceName);
            console.log(`[SetupWhatsApp] Deleted existing instance: ${instanceName}`);
          } catch (deleteError) {
            console.warn(`[SetupWhatsApp] Failed to delete existing instance:`, deleteError);
            // Continue anyway, might fail if instance doesn't exist
          }
        }
      } catch (fetchError) {
        // If instance doesn't exist, Evolution API returns 500 error
        // This is normal, just continue with creation
        const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
        if (errorMessage.includes('not found') || errorMessage.includes('Instance')) {
          // Instance doesn't exist, which is fine - we'll create it
          console.log(
            `[SetupWhatsApp] Instance ${instanceName} does not exist, will create new one`,
          );
        } else {
          // Other error, log but continue
          console.warn(`[SetupWhatsApp] Could not check existing instances:`, fetchError);
        }
      }

      // Delete old instance if exists in settings
      if (settings.whatsappInstanceName && settings.whatsappInstanceName !== instanceName) {
        try {
          await this.evolutionApi.deleteInstance(settings.whatsappInstanceName);
          console.log(`[SetupWhatsApp] Deleted old instance: ${settings.whatsappInstanceName}`);
        } catch {
          // Instance might not exist, ignore the error
        }
      }

      const createResponse = await this.evolutionApi.createInstance({
        instanceName,
        qrcode: true,
      });

      // Configure webhook for field note agent integration
      // NOTE: Webhook configuration is currently disabled during setup due to Evolution API
      // compatibility issues. The webhook can be configured manually via Evolution API dashboard
      // or via the /webhook/set endpoint after the instance is created.
      const webhookConfigured = false;
      const webhookUrl = input.webhookUrl || process.env.WHATSAPP_WEBHOOK_URL;

      if (webhookUrl) {
        console.log(`[SetupWhatsApp] Webhook URL available: ${webhookUrl}`);
        console.log(
          '[SetupWhatsApp] Webhook auto-configuration disabled. Configure manually if needed.',
        );
      }

      await this.settingsRepository.updateWhatsAppConfig(settings.id, {
        whatsappInstanceName: instanceName,
        whatsappApiKey: createResponse.hash.apikey,
        whatsappInstanceId: createResponse.instance.instanceId,
        whatsappConnected: false,
        whatsappQrCode: createResponse.qrcode?.base64 || null,
        whatsappLastSync: new Date(),
      });

      return {
        instanceName,
        instanceId: createResponse.instance.instanceId,
        apiKey: createResponse.hash.apikey,
        qrCode: createResponse.qrcode?.code || null,
        qrCodeBase64: createResponse.qrcode?.base64 || null,
        webhookConfigured,
      };
    } catch (error) {
      if (error instanceof EvolutionApiError) {
        throw AppError.badRequest(
          `Failed to create WhatsApp instance: ${error.message}`,
          'EVOLUTION_API_ERROR',
        );
      }
      throw error;
    }
  }
}
