import { Request, Response } from 'express';
import { Settings } from '../../../domain/entities/Settings';
import { AppError } from '../../../domain/errors/AppError';
import { ISettingsRepository } from '../../../domain/repositories/ISettingsRepository';
import { requireAuthenticatedUserId } from './controller-auth';

type IntegrationKind = 'email' | 'openMeteo' | 'qdcSync';

/** Handles opt-in state for optional per-user integrations. */
export class SettingsIntegrationController {
  constructor(private readonly repository: ISettingsRepository) {}

  async getEmailInboundStatus(request: Request, response: Response): Promise<Response> {
    const settings = await this.repository.findByUserId(requireAuthenticatedUserId(request));
    return response.json({
      status: 'success',
      data: {
        enabled: settings?.isEmailIngestionEnabled() ?? false,
        inboxAddress: process.env.EMAIL_INBOUND_DOMAIN
          ? `inbox@${process.env.EMAIL_INBOUND_DOMAIN}`
          : 'inbox@localhost',
      },
    });
  }

  async updateEmailInbound(request: Request, response: Response): Promise<Response> {
    return this.updateIntegration(request, response, 'email');
  }

  async getOpenMeteoStatus(request: Request, response: Response): Promise<Response> {
    return this.getIntegrationStatus(request, response, 'openMeteo');
  }

  async updateOpenMeteo(request: Request, response: Response): Promise<Response> {
    return this.updateIntegration(request, response, 'openMeteo');
  }

  async getQdcSyncStatus(request: Request, response: Response): Promise<Response> {
    return this.getIntegrationStatus(request, response, 'qdcSync');
  }

  async updateQdcSync(request: Request, response: Response): Promise<Response> {
    return this.updateIntegration(request, response, 'qdcSync');
  }

  private async getIntegrationStatus(
    request: Request,
    response: Response,
    kind: Exclude<IntegrationKind, 'email'>,
  ): Promise<Response> {
    const settings = await this.repository.findByUserId(requireAuthenticatedUserId(request));
    const enabled =
      kind === 'openMeteo'
        ? (settings?.isOpenMeteoEnabled() ?? false)
        : (settings?.isQdcSyncEnabled() ?? false);
    return response.json({ status: 'success', data: { enabled } });
  }

  private async updateIntegration(
    request: Request,
    response: Response,
    kind: IntegrationKind,
  ): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const { enabled } = request.body as { enabled?: unknown };
    if (typeof enabled !== 'boolean') {
      throw AppError.badRequest('Field "enabled" must be a boolean', 'INVALID_PAYLOAD');
    }
    const settings = await this.findOrCreate(userId);
    if (kind === 'email') {
      const updated = await this.repository.updateEmailIngestionEnabled(settings.id, enabled);
      return response.json({
        status: 'success',
        data: { enabled: updated.isEmailIngestionEnabled() },
      });
    }
    if (kind === 'openMeteo') {
      const updated = await this.repository.updateOpenMeteoEnabled(settings.id, enabled);
      return response.json({
        status: 'success',
        data: { enabled: updated.isOpenMeteoEnabled() },
      });
    }
    const updated = await this.repository.updateQdcSyncEnabled(settings.id, enabled);
    return response.json({
      status: 'success',
      data: { enabled: updated.isQdcSyncEnabled() },
    });
  }

  private async findOrCreate(userId: string): Promise<Settings> {
    const existing = await this.repository.findByUserId(userId);
    if (existing) return existing;
    return this.repository.create(
      Settings.create({
        userId,
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
}
