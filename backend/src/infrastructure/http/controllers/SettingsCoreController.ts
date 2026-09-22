import { Request, Response } from 'express';
import { Settings, TABLES_VIEW_MODES, TablesViewMode } from '../../../domain/entities/Settings';
import { AppError } from '../../../domain/errors/AppError';
import { ISettingsRepository } from '../../../domain/repositories/ISettingsRepository';
import { requireAuthenticatedUserId } from './controller-auth';

/** Handles the core per-user settings resource. */
export class SettingsCoreController {
  constructor(private readonly repository: ISettingsRepository) {}

  async create(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const {
      language,
      qdcApiKey = null,
      ifarmingApiKey = null,
      tablesViewMode = 'grid',
    } = request.body;
    if (!language) {
      throw AppError.badRequest('Missing required field: language', 'MISSING_FIELDS');
    }
    if (!TABLES_VIEW_MODES.includes(tablesViewMode)) {
      throw AppError.badRequest(
        'Invalid tablesViewMode. Allowed values: grid, excel',
        'INVALID_TABLES_VIEW_MODE',
      );
    }
    if (await this.repository.findByUserId(userId)) {
      throw AppError.conflict('Settings already exist for this user', 'SETTINGS_EXISTS');
    }
    const entity = Settings.create({
      userId,
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
    const settings = await this.repository.create(entity);
    return response.status(201).json({ status: 'success', data: { settings } });
  }

  async getMine(request: Request, response: Response): Promise<Response> {
    const settings = await this.repository.findByUserId(requireAuthenticatedUserId(request));
    if (!settings) throw AppError.notFound('Settings not found', 'SETTINGS_NOT_FOUND');
    return response.json({ status: 'success', data: { settings } });
  }

  async getById(request: Request, response: Response): Promise<Response> {
    const settings = await this.repository.findById(request.params.id);
    if (!settings) throw AppError.notFound('Settings not found', 'SETTINGS_NOT_FOUND');
    if (requireAuthenticatedUserId(request) !== settings.userId) {
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
    const existing = await this.repository.findById(id);
    if (!existing) throw AppError.notFound('Settings not found', 'SETTINGS_NOT_FOUND');
    if (requireAuthenticatedUserId(request) !== existing.userId) {
      throw AppError.forbidden('You are not allowed to update these settings', 'FORBIDDEN');
    }
    const settings = await this.repository.update(id, updateData);
    return response.json({ status: 'success', data: { settings } });
  }

  async delete(request: Request, response: Response): Promise<Response> {
    const { id } = request.params;
    const existing = await this.repository.findById(id);
    if (!existing) throw AppError.notFound('Settings not found', 'SETTINGS_NOT_FOUND');
    if (requireAuthenticatedUserId(request) !== existing.userId) {
      throw AppError.forbidden('You are not allowed to delete these settings', 'FORBIDDEN');
    }
    await this.repository.delete(id);
    return response.status(204).send();
  }
}
