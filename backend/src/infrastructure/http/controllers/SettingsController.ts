import { Request, Response } from 'express';
import { ISettingsRepository } from '../../../domain/repositories/ISettingsRepository';
import { SettingsCoreController } from './SettingsCoreController';
import { SettingsIntegrationController } from './SettingsIntegrationController';
import { SettingsWhatsAppController } from './SettingsWhatsAppController';

/** Routes settings requests to focused controllers while preserving the public API. */
export class SettingsController {
  private readonly core: SettingsCoreController;
  private readonly integrations: SettingsIntegrationController;
  private readonly whatsapp: SettingsWhatsAppController;

  constructor(settingsRepository: ISettingsRepository) {
    this.core = new SettingsCoreController(settingsRepository);
    this.integrations = new SettingsIntegrationController(settingsRepository);
    this.whatsapp = new SettingsWhatsAppController(settingsRepository);
  }

  async create(request: Request, response: Response): Promise<Response> {
    return this.core.create(request, response);
  }

  async getMine(request: Request, response: Response): Promise<Response> {
    return this.core.getMine(request, response);
  }

  async getById(request: Request, response: Response): Promise<Response> {
    return this.core.getById(request, response);
  }

  async update(request: Request, response: Response): Promise<Response> {
    return this.core.update(request, response);
  }

  async delete(request: Request, response: Response): Promise<Response> {
    return this.core.delete(request, response);
  }

  async setupWhatsApp(request: Request, response: Response): Promise<Response> {
    return this.whatsapp.setup(request, response);
  }

  async getWhatsAppQrCode(request: Request, response: Response): Promise<Response> {
    return this.whatsapp.getQrCode(request, response);
  }

  async getWhatsAppStatus(request: Request, response: Response): Promise<Response> {
    return this.whatsapp.getStatus(request, response);
  }

  async disconnectWhatsApp(request: Request, response: Response): Promise<Response> {
    return this.whatsapp.disconnect(request, response);
  }

  async sendWhatsAppMessage(request: Request, response: Response): Promise<Response> {
    return this.whatsapp.sendMessage(request, response);
  }

  async getWhatsAppAllowlist(request: Request, response: Response): Promise<Response> {
    return this.whatsapp.getAllowlist(request, response);
  }

  async addWhatsAppAllowedNumber(request: Request, response: Response): Promise<Response> {
    return this.whatsapp.addAllowedNumber(request, response);
  }

  async removeWhatsAppAllowedNumber(request: Request, response: Response): Promise<Response> {
    return this.whatsapp.removeAllowedNumber(request, response);
  }

  async getEmailInboundStatus(request: Request, response: Response): Promise<Response> {
    return this.integrations.getEmailInboundStatus(request, response);
  }

  async updateEmailInbound(request: Request, response: Response): Promise<Response> {
    return this.integrations.updateEmailInbound(request, response);
  }

  async getOpenMeteoStatus(request: Request, response: Response): Promise<Response> {
    return this.integrations.getOpenMeteoStatus(request, response);
  }

  async updateOpenMeteo(request: Request, response: Response): Promise<Response> {
    return this.integrations.updateOpenMeteo(request, response);
  }

  async getQdcSyncStatus(request: Request, response: Response): Promise<Response> {
    return this.integrations.getQdcSyncStatus(request, response);
  }

  async updateQdcSync(request: Request, response: Response): Promise<Response> {
    return this.integrations.updateQdcSync(request, response);
  }
}
