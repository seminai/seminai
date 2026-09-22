import { Request, Response } from 'express';
import { ISettingsRepository } from '../../../domain/repositories/ISettingsRepository';
import { AppError } from '../../../domain/errors/AppError';
import { Settings, TABLES_VIEW_MODES, TablesViewMode } from '../../../domain/entities/Settings';
import { SetupWhatsAppUseCase } from '../../../application/use-cases/whatsapp/SetupWhatsAppUseCase';
import { GetWhatsAppQrCodeUseCase } from '../../../application/use-cases/whatsapp/GetWhatsAppQrCodeUseCase';
import { GetWhatsAppStatusUseCase } from '../../../application/use-cases/whatsapp/GetWhatsAppStatusUseCase';
import { DisconnectWhatsAppUseCase } from '../../../application/use-cases/whatsapp/DisconnectWhatsAppUseCase';
import { SendWhatsAppMessageUseCase } from '../../../application/use-cases/whatsapp/SendWhatsAppMessageUseCase';
import { EvolutionApiService } from '../../services/whatsapp/EvolutionApiService';

export class SettingsController {
  private readonly evolutionApi: EvolutionApiService | null;

  constructor(private readonly settingsRepository: ISettingsRepository) {
    const evolutionApiUrl = process.env.EVOLUTION_API_URL;
    const evolutionApiKey = process.env.EVOLUTION_API_KEY;

    if (evolutionApiUrl && evolutionApiKey) {
      this.evolutionApi = new EvolutionApiService({
        baseUrl: evolutionApiUrl,
        globalApiKey: evolutionApiKey,
      });
    } else {
      this.evolutionApi = null;
    }
  }

  async create(request: Request, response: Response): Promise<Response> {
    const {
      language,
      qdcApiKey = null,
      ifarmingApiKey = null,
      tablesViewMode = 'grid',
    } = request.body;

    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    if (!language) {
      throw AppError.badRequest('Missing required field: language', 'MISSING_FIELDS');
    }

    if (!TABLES_VIEW_MODES.includes(tablesViewMode)) {
      throw AppError.badRequest(
        'Invalid tablesViewMode. Allowed values: grid, excel',
        'INVALID_TABLES_VIEW_MODE',
      );
    }

    const existing = await this.settingsRepository.findByUserId(request.user.id);
    if (existing) {
      throw AppError.conflict('Settings already exist for this user', 'SETTINGS_EXISTS');
    }

    const entity = Settings.create({
      userId: request.user.id,
      language,
      qdcApiKey,
      ifarmingApiKey,
      tablesViewMode,
      whatsappInstanceName: null,
      whatsappApiKey: null,
      whatsappInstanceId: null,
      whatsappConnected: false,
      whatsappPhoneNumber: null,
      whatsappQrCode: null,
      whatsappLastSync: null,
      whatsappAllowedNumbers: [],
    });

    const created = await this.settingsRepository.create(entity);

    return response.status(201).json({
      status: 'success',
      data: { settings: created },
    });
  }

  async getMine(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const settings = await this.settingsRepository.findByUserId(request.user.id);
    if (!settings) {
      throw AppError.notFound('Settings not found', 'SETTINGS_NOT_FOUND');
    }

    return response.json({ status: 'success', data: { settings } });
  }

  async getById(request: Request, response: Response): Promise<Response> {
    const { id } = request.params;

    const settings = await this.settingsRepository.findById(id);
    if (!settings) {
      throw AppError.notFound('Settings not found', 'SETTINGS_NOT_FOUND');
    }

    if (!request.user?.id || request.user.id !== settings.userId) {
      throw AppError.forbidden('You are not allowed to access these settings', 'FORBIDDEN');
    }

    return response.json({ status: 'success', data: { settings } });
  }

  async update(request: Request, response: Response): Promise<Response> {
    const { id } = request.params;
    const updateData = request.body as Partial<
      Pick<Settings, 'language' | 'qdcApiKey' | 'ifarmingApiKey' | 'tablesViewMode'>
    >;

    if (
      updateData.tablesViewMode !== undefined &&
      !TABLES_VIEW_MODES.includes(updateData.tablesViewMode as TablesViewMode)
    ) {
      throw AppError.badRequest(
        'Invalid tablesViewMode. Allowed values: grid, excel',
        'INVALID_TABLES_VIEW_MODE',
      );
    }

    const existing = await this.settingsRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Settings not found', 'SETTINGS_NOT_FOUND');
    }

    if (!request.user?.id || request.user.id !== existing.userId) {
      throw AppError.forbidden('You are not allowed to update these settings', 'FORBIDDEN');
    }

    const updated = await this.settingsRepository.update(id, updateData);

    return response.json({ status: 'success', data: { settings: updated } });
  }

  async delete(request: Request, response: Response): Promise<Response> {
    const { id } = request.params;

    const existing = await this.settingsRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Settings not found', 'SETTINGS_NOT_FOUND');
    }

    if (!request.user?.id || request.user.id !== existing.userId) {
      throw AppError.forbidden('You are not allowed to delete these settings', 'FORBIDDEN');
    }

    await this.settingsRepository.delete(id);

    return response.status(204).send();
  }

  /**
   * Setup WhatsApp integration for the authenticated user.
   */
  async setupWhatsApp(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    if (!this.evolutionApi) {
      throw AppError.badRequest(
        'WhatsApp integration is not configured. Please set EVOLUTION_API_URL and EVOLUTION_API_KEY environment variables.',
        'WHATSAPP_NOT_CONFIGURED_SERVER',
      );
    }

    const { instanceName } = request.body;

    const useCase = new SetupWhatsAppUseCase(this.settingsRepository, this.evolutionApi);
    const result = await useCase.execute({
      userId: request.user.id,
      instanceName,
    });

    return response.status(201).json({
      status: 'success',
      data: result,
    });
  }

  /**
   * Get WhatsApp QR code for connection.
   */
  async getWhatsAppQrCode(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    if (!this.evolutionApi) {
      throw AppError.badRequest(
        'WhatsApp integration is not configured',
        'WHATSAPP_NOT_CONFIGURED_SERVER',
      );
    }

    const useCase = new GetWhatsAppQrCodeUseCase(this.settingsRepository, this.evolutionApi);
    const result = await useCase.execute({ userId: request.user.id });

    return response.json({
      status: 'success',
      data: result,
    });
  }

  /**
   * Get WhatsApp connection status.
   */
  async getWhatsAppStatus(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    if (!this.evolutionApi) {
      throw AppError.badRequest(
        'WhatsApp integration is not configured',
        'WHATSAPP_NOT_CONFIGURED_SERVER',
      );
    }

    const useCase = new GetWhatsAppStatusUseCase(this.settingsRepository, this.evolutionApi);
    const result = await useCase.execute({ userId: request.user.id });

    return response.json({
      status: 'success',
      data: result,
    });
  }

  /**
   * Disconnect WhatsApp.
   */
  async disconnectWhatsApp(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    if (!this.evolutionApi) {
      throw AppError.badRequest(
        'WhatsApp integration is not configured',
        'WHATSAPP_NOT_CONFIGURED_SERVER',
      );
    }

    const { deleteInstance } = request.body;

    const useCase = new DisconnectWhatsAppUseCase(this.settingsRepository, this.evolutionApi);
    const result = await useCase.execute({
      userId: request.user.id,
      deleteInstance: deleteInstance ?? false,
    });

    return response.json({
      status: 'success',
      data: result,
    });
  }

  /**
   * Send a WhatsApp message.
   */
  async sendWhatsAppMessage(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    if (!this.evolutionApi) {
      throw AppError.badRequest(
        'WhatsApp integration is not configured',
        'WHATSAPP_NOT_CONFIGURED_SERVER',
      );
    }

    const { phoneNumber, message } = request.body;

    if (!phoneNumber || !message) {
      throw AppError.badRequest(
        'Missing required fields: phoneNumber and message',
        'MISSING_FIELDS',
      );
    }

    const useCase = new SendWhatsAppMessageUseCase(this.settingsRepository, this.evolutionApi);
    const result = await useCase.execute({
      userId: request.user.id,
      phoneNumber,
      message,
    });

    return response.json({
      status: 'success',
      data: result,
    });
  }

  /**
   * Get the WhatsApp phone number allowlist.
   */
  async getWhatsAppAllowlist(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const settings = await this.settingsRepository.findByUserId(request.user.id);
    if (!settings) {
      throw AppError.notFound('Settings not found', 'SETTINGS_NOT_FOUND');
    }

    return response.json({
      status: 'success',
      data: {
        allowedNumbers: settings.whatsappAllowedNumbers,
        count: settings.whatsappAllowedNumbers.length,
      },
    });
  }

  /**
   * Add a phone number to the WhatsApp allowlist.
   */
  async addWhatsAppAllowedNumber(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { phoneNumber } = request.body;

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      throw AppError.badRequest('Missing required field: phoneNumber', 'MISSING_FIELDS');
    }

    // Normalize: strip + prefix and any spaces/dashes
    const normalized = phoneNumber.replace(/[\s\-+]/g, '');

    if (!/^\d+$/.test(normalized)) {
      throw AppError.badRequest(
        'Invalid phone number format. Use digits only, e.g., 393331234567',
        'INVALID_PHONE_NUMBER',
      );
    }

    const settings = await this.settingsRepository.findByUserId(request.user.id);
    if (!settings) {
      throw AppError.notFound('Settings not found', 'SETTINGS_NOT_FOUND');
    }

    if (settings.whatsappAllowedNumbers.includes(normalized)) {
      throw AppError.conflict('Phone number already in allowlist', 'NUMBER_ALREADY_EXISTS');
    }

    const updatedNumbers = [...settings.whatsappAllowedNumbers, normalized];

    await this.settingsRepository.updateWhatsAppConfig(settings.id, {
      whatsappAllowedNumbers: updatedNumbers,
    });

    return response.status(201).json({
      status: 'success',
      data: {
        allowedNumbers: updatedNumbers,
        addedNumber: normalized,
        count: updatedNumbers.length,
      },
    });
  }

  /**
   * Remove a phone number from the WhatsApp allowlist.
   */
  async removeWhatsAppAllowedNumber(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { phoneNumber } = request.params;

    if (!phoneNumber) {
      throw AppError.badRequest('Missing required parameter: phoneNumber', 'MISSING_FIELDS');
    }

    const normalized = phoneNumber.replace(/[\s\-+]/g, '');

    const settings = await this.settingsRepository.findByUserId(request.user.id);
    if (!settings) {
      throw AppError.notFound('Settings not found', 'SETTINGS_NOT_FOUND');
    }

    if (!settings.whatsappAllowedNumbers.includes(normalized)) {
      throw AppError.notFound('Phone number not found in allowlist', 'NUMBER_NOT_FOUND');
    }

    const updatedNumbers = settings.whatsappAllowedNumbers.filter((n) => n !== normalized);

    await this.settingsRepository.updateWhatsAppConfig(settings.id, {
      whatsappAllowedNumbers: updatedNumbers,
    });

    return response.json({
      status: 'success',
      data: {
        allowedNumbers: updatedNumbers,
        removedNumber: normalized,
        count: updatedNumbers.length,
      },
    });
  }

  /**
   * Get the email inbound integration status for the authenticated user.
   * Returns the opt-in flag and the inbox address users should send emails to.
   */
  async getEmailInboundStatus(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const settings = await this.settingsRepository.findByUserId(request.user.id);
    return response.json({
      status: 'success',
      data: {
        enabled: settings?.isEmailIngestionEnabled() ?? false,
        inboxAddress: process.env.EMAIL_INBOUND_DOMAIN
          ? `inbox@${process.env.EMAIL_INBOUND_DOMAIN}`
          : 'inbox@inbox.seminai.app',
      },
    });
  }

  /**
   * Toggle the email inbound integration for the authenticated user.
   * Body: { enabled: boolean }. Auto-creates Settings with defaults if missing.
   */
  async updateEmailInbound(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { enabled } = request.body as { enabled?: unknown };
    if (typeof enabled !== 'boolean') {
      throw AppError.badRequest('Field "enabled" must be a boolean', 'INVALID_PAYLOAD');
    }
    let settings = await this.settingsRepository.findByUserId(request.user.id);
    if (!settings) {
      settings = await this.settingsRepository.create(
        Settings.create({
          userId: request.user.id,
          language: 'it',
          qdcApiKey: null,
          ifarmingApiKey: null,
          whatsappInstanceName: null,
          whatsappApiKey: null,
          whatsappInstanceId: null,
          whatsappConnected: false,
          whatsappPhoneNumber: null,
          whatsappQrCode: null,
          whatsappLastSync: null,
          whatsappAllowedNumbers: [],
        }),
      );
    }
    const updated = await this.settingsRepository.updateEmailIngestionEnabled(settings.id, enabled);
    return response.json({
      status: 'success',
      data: { enabled: updated.isEmailIngestionEnabled() },
    });
  }

  /**
   * Get the Open-Meteo weather integration status for the authenticated user.
   */
  async getOpenMeteoStatus(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const settings = await this.settingsRepository.findByUserId(request.user.id);
    return response.json({
      status: 'success',
      data: {
        enabled: settings?.isOpenMeteoEnabled() ?? false,
      },
    });
  }

  /**
   * Toggle the Open-Meteo weather integration for the authenticated user.
   * Body: { enabled: boolean }. Auto-creates Settings with defaults if missing.
   */
  async updateOpenMeteo(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { enabled } = request.body as { enabled?: unknown };
    if (typeof enabled !== 'boolean') {
      throw AppError.badRequest('Field "enabled" must be a boolean', 'INVALID_PAYLOAD');
    }
    let settings = await this.settingsRepository.findByUserId(request.user.id);
    if (!settings) {
      settings = await this.settingsRepository.create(
        Settings.create({
          userId: request.user.id,
          language: 'it',
          qdcApiKey: null,
          ifarmingApiKey: null,
          whatsappInstanceName: null,
          whatsappApiKey: null,
          whatsappInstanceId: null,
          whatsappConnected: false,
          whatsappPhoneNumber: null,
          whatsappQrCode: null,
          whatsappLastSync: null,
          whatsappAllowedNumbers: [],
        }),
      );
    }
    const updated = await this.settingsRepository.updateOpenMeteoEnabled(settings.id, enabled);
    return response.json({
      status: 'success',
      data: { enabled: updated.isOpenMeteoEnabled() },
    });
  }

  /**
   * Get the QDC (Quaderno di Campagna) nightly sync opt-in for the authenticated user.
   */
  async getQdcSyncStatus(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const settings = await this.settingsRepository.findByUserId(request.user.id);
    return response.json({
      status: 'success',
      data: {
        enabled: settings?.isQdcSyncEnabled() ?? false,
      },
    });
  }

  /**
   * Toggle the QDC nightly sync opt-in for the authenticated user.
   * Body: { enabled: boolean }. Auto-creates Settings with defaults if missing.
   */
  async updateQdcSync(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { enabled } = request.body as { enabled?: unknown };
    if (typeof enabled !== 'boolean') {
      throw AppError.badRequest('Field "enabled" must be a boolean', 'INVALID_PAYLOAD');
    }
    let settings = await this.settingsRepository.findByUserId(request.user.id);
    if (!settings) {
      settings = await this.settingsRepository.create(
        Settings.create({
          userId: request.user.id,
          language: 'it',
          qdcApiKey: null,
          ifarmingApiKey: null,
          whatsappInstanceName: null,
          whatsappApiKey: null,
          whatsappInstanceId: null,
          whatsappConnected: false,
          whatsappPhoneNumber: null,
          whatsappQrCode: null,
          whatsappLastSync: null,
          whatsappAllowedNumbers: [],
        }),
      );
    }
    const updated = await this.settingsRepository.updateQdcSyncEnabled(settings.id, enabled);
    return response.json({
      status: 'success',
      data: { enabled: updated.isQdcSyncEnabled() },
    });
  }
}
