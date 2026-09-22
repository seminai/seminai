import { Request, Response } from 'express';
import { DisconnectWhatsAppUseCase } from '../../../application/use-cases/whatsapp/DisconnectWhatsAppUseCase';
import { GetWhatsAppQrCodeUseCase } from '../../../application/use-cases/whatsapp/GetWhatsAppQrCodeUseCase';
import { GetWhatsAppStatusUseCase } from '../../../application/use-cases/whatsapp/GetWhatsAppStatusUseCase';
import { SendWhatsAppMessageUseCase } from '../../../application/use-cases/whatsapp/SendWhatsAppMessageUseCase';
import { SetupWhatsAppUseCase } from '../../../application/use-cases/whatsapp/SetupWhatsAppUseCase';
import { AppError } from '../../../domain/errors/AppError';
import { ISettingsRepository } from '../../../domain/repositories/ISettingsRepository';
import { EvolutionApiService } from '../../services/whatsapp/EvolutionApiService';
import { requireAuthenticatedUserId } from './controller-auth';

/** Handles optional WhatsApp settings and allowlist operations. */
export class SettingsWhatsAppController {
  private readonly evolutionApi: EvolutionApiService | null;

  constructor(private readonly repository: ISettingsRepository) {
    const baseUrl = process.env.EVOLUTION_API_URL;
    const globalApiKey = process.env.EVOLUTION_API_KEY;
    this.evolutionApi =
      baseUrl && globalApiKey ? new EvolutionApiService({ baseUrl, globalApiKey }) : null;
  }

  private requireEvolutionApi(): EvolutionApiService {
    if (!this.evolutionApi) {
      throw AppError.badRequest(
        'WhatsApp integration is not configured',
        'WHATSAPP_NOT_CONFIGURED_SERVER',
      );
    }
    return this.evolutionApi;
  }

  async setup(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const result = await new SetupWhatsAppUseCase(
      this.repository,
      this.requireEvolutionApi(),
    ).execute({ userId, instanceName: request.body.instanceName });
    return response.status(201).json({ status: 'success', data: result });
  }

  async getQrCode(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const result = await new GetWhatsAppQrCodeUseCase(
      this.repository,
      this.requireEvolutionApi(),
    ).execute({ userId });
    return response.json({ status: 'success', data: result });
  }

  async getStatus(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const result = await new GetWhatsAppStatusUseCase(
      this.repository,
      this.requireEvolutionApi(),
    ).execute({ userId });
    return response.json({ status: 'success', data: result });
  }

  async disconnect(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const result = await new DisconnectWhatsAppUseCase(
      this.repository,
      this.requireEvolutionApi(),
    ).execute({ userId, deleteInstance: request.body.deleteInstance ?? false });
    return response.json({ status: 'success', data: result });
  }

  async sendMessage(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const { phoneNumber, message } = request.body;
    if (!phoneNumber || !message) {
      throw AppError.badRequest(
        'Missing required fields: phoneNumber and message',
        'MISSING_FIELDS',
      );
    }
    const result = await new SendWhatsAppMessageUseCase(
      this.repository,
      this.requireEvolutionApi(),
    ).execute({ userId, phoneNumber, message });
    return response.json({ status: 'success', data: result });
  }

  async getAllowlist(request: Request, response: Response): Promise<Response> {
    const settings = await this.getSettings(requireAuthenticatedUserId(request));
    return response.json({
      status: 'success',
      data: {
        allowedNumbers: settings.whatsappAllowedNumbers,
        count: settings.whatsappAllowedNumbers.length,
      },
    });
  }

  async addAllowedNumber(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const { phoneNumber } = request.body;
    if (!phoneNumber || typeof phoneNumber !== 'string') {
      throw AppError.badRequest('Missing required field: phoneNumber', 'MISSING_FIELDS');
    }
    const normalized = phoneNumber.replace(/[\s\-+]/g, '');
    if (!/^\d+$/.test(normalized)) {
      throw AppError.badRequest(
        'Invalid phone number format. Use digits only, e.g., 393331234567',
        'INVALID_PHONE_NUMBER',
      );
    }
    const settings = await this.getSettings(userId);
    if (settings.whatsappAllowedNumbers.includes(normalized)) {
      throw AppError.conflict('Phone number already in allowlist', 'NUMBER_ALREADY_EXISTS');
    }
    const allowedNumbers = [...settings.whatsappAllowedNumbers, normalized];
    await this.repository.updateWhatsAppConfig(settings.id, {
      whatsappAllowedNumbers: allowedNumbers,
    });
    return response.status(201).json({
      status: 'success',
      data: { allowedNumbers, addedNumber: normalized, count: allowedNumbers.length },
    });
  }

  async removeAllowedNumber(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const { phoneNumber } = request.params;
    if (!phoneNumber) {
      throw AppError.badRequest('Missing required parameter: phoneNumber', 'MISSING_FIELDS');
    }
    const normalized = phoneNumber.replace(/[\s\-+]/g, '');
    const settings = await this.getSettings(userId);
    if (!settings.whatsappAllowedNumbers.includes(normalized)) {
      throw AppError.notFound('Phone number not found in allowlist', 'NUMBER_NOT_FOUND');
    }
    const allowedNumbers = settings.whatsappAllowedNumbers.filter(
      (number) => number !== normalized,
    );
    await this.repository.updateWhatsAppConfig(settings.id, {
      whatsappAllowedNumbers: allowedNumbers,
    });
    return response.json({
      status: 'success',
      data: { allowedNumbers, removedNumber: normalized, count: allowedNumbers.length },
    });
  }

  private async getSettings(userId: string) {
    const settings = await this.repository.findByUserId(userId);
    if (!settings) throw AppError.notFound('Settings not found', 'SETTINGS_NOT_FOUND');
    return settings;
  }
}
