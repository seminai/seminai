import { Request, Response } from 'express';
import { SettingsController } from '../infrastructure/http/controllers/SettingsController';
import { ISettingsRepository } from '../domain/repositories/ISettingsRepository';
import { Settings } from '../domain/entities/Settings';
import { AppError } from '../domain/errors/AppError';

/**
 * Helper function to create a test Settings instance with default WhatsApp fields.
 */
function createTestSettings(
  id: string,
  userId: string,
  language: string,
  qdcApiKey: string | null,
  ifarmingApiKey: string | null,
): Settings {
  const now = new Date();
  return new Settings({
    id,
    userId,
    language,
    qdcApiKey,
    ifarmingApiKey,
    tablesViewMode: 'grid',
    whatsappInstanceName: null,
    whatsappApiKey: null,
    whatsappInstanceId: null,
    whatsappConnected: false,
    whatsappPhoneNumber: null,
    whatsappQrCode: null,
    whatsappLastSync: null,
    whatsappAllowedNumbers: [],
    emailIngestionEnabled: false,
    openMeteoEnabled: false,
    qdcSyncEnabled: false,
    createdAt: now,
    updatedAt: now,
  });
}

describe('SettingsController', () => {
  let controller: SettingsController;
  let mockRepository: jest.Mocked<ISettingsRepository>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      findByWhatsappInstanceName: jest.fn(),
      update: jest.fn(),
      updateWhatsAppConfig: jest.fn(),
      updateEmailIngestionEnabled: jest.fn(),
      updateOpenMeteoEnabled: jest.fn(),
      updateQdcSyncEnabled: jest.fn(),
      delete: jest.fn(),
    } as jest.Mocked<ISettingsRepository>;

    controller = new SettingsController(mockRepository);

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn(),
    } as unknown as Partial<Response>;
  });

  describe('create', () => {
    it('should create settings for authenticated user', async () => {
      const userId = 'user-1';
      const input = { language: 'it', qdcApiKey: 'qdc', ifarmingApiKey: 'ifa' };

      mockRequest = { body: input, user: { id: userId } };

      mockRepository.findByUserId.mockResolvedValue(null);

      const created = createTestSettings(
        'settings-1',
        userId,
        input.language,
        input.qdcApiKey,
        input.ifarmingApiKey,
      );

      mockRepository.create.mockResolvedValue(created);

      await controller.create(mockRequest as Request, mockResponse as Response);

      expect(mockRepository.findByUserId).toHaveBeenCalledWith(userId);
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { settings: created },
      });
    });

    it('should reject when unauthenticated', async () => {
      mockRequest = { body: { language: 'it' }, user: undefined };
      await expect(
        controller.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should reject when language is missing', async () => {
      mockRequest = { body: {}, user: { id: 'user-1' } };
      await expect(
        controller.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should reject when settings already exist for user', async () => {
      const existing = createTestSettings('settings-1', 'user-1', 'it', null, null);
      mockRequest = { body: { language: 'it' }, user: { id: 'user-1' } };
      mockRepository.findByUserId.mockResolvedValue(existing);

      await expect(
        controller.create(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });

  describe('getMine', () => {
    it('should return settings for authenticated user', async () => {
      const userId = 'user-1';
      const settings = createTestSettings('s1', userId, 'it', null, null);
      mockRequest = { user: { id: userId } };
      mockRepository.findByUserId.mockResolvedValue(settings);

      await controller.getMine(mockRequest as Request, mockResponse as Response);

      expect(mockRepository.findByUserId).toHaveBeenCalledWith(userId);
      expect(mockResponse.json).toHaveBeenCalledWith({ status: 'success', data: { settings } });
    });

    it('should throw when unauthenticated', async () => {
      mockRequest = { user: undefined };
      await expect(
        controller.getMine(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should throw when settings not found', async () => {
      mockRequest = { user: { id: 'user-1' } };
      mockRepository.findByUserId.mockResolvedValue(null);

      await expect(
        controller.getMine(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });

  describe('getById', () => {
    it('should return settings by id for owner', async () => {
      const settings = createTestSettings('s1', 'user-1', 'it', null, null);
      mockRequest = { params: { id: 's1' }, user: { id: 'user-1' } };
      mockRepository.findById.mockResolvedValue(settings);

      await controller.getById(mockRequest as Request, mockResponse as Response);

      expect(mockRepository.findById).toHaveBeenCalledWith('s1');
      expect(mockResponse.json).toHaveBeenCalledWith({ status: 'success', data: { settings } });
    });

    it('should throw when not found', async () => {
      mockRequest = { params: { id: 's1' }, user: { id: 'user-1' } };
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        controller.getById(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should forbid access when not owner', async () => {
      const settings = createTestSettings('s1', 'user-2', 'it', null, null);
      mockRequest = { params: { id: 's1' }, user: { id: 'user-1' } };
      mockRepository.findById.mockResolvedValue(settings);

      await expect(
        controller.getById(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });

  describe('update', () => {
    it('should update settings for owner', async () => {
      const existing = createTestSettings('s1', 'user-1', 'it', 'a', 'b');
      const updated = createTestSettings('s1', 'user-1', 'en', 'x', 'y');
      mockRequest = {
        params: { id: 's1' },
        body: { language: 'en', qdcApiKey: 'x', ifarmingApiKey: 'y' },
        user: { id: 'user-1' },
      };
      mockRepository.findById.mockResolvedValue(existing);
      mockRepository.update.mockResolvedValue(updated);

      await controller.update(mockRequest as Request, mockResponse as Response);

      expect(mockRepository.update).toHaveBeenCalledWith('s1', {
        language: 'en',
        qdcApiKey: 'x',
        ifarmingApiKey: 'y',
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        status: 'success',
        data: { settings: updated },
      });
    });

    it('should throw when settings not found', async () => {
      mockRequest = { params: { id: 's1' }, body: {}, user: { id: 'user-1' } };
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        controller.update(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should forbid update when not owner', async () => {
      const existing = createTestSettings('s1', 'user-2', 'it', null, null);
      mockRequest = { params: { id: 's1' }, body: {}, user: { id: 'user-1' } };
      mockRepository.findById.mockResolvedValue(existing);

      await expect(
        controller.update(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });

  describe('tablesViewMode preference', () => {
    it('should default to grid when not provided on create', () => {
      const settings = Settings.create({
        userId: 'user-1',
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
      });
      expect(settings.tablesViewMode).toBe('grid');
    });

    it('should clamp unknown string values to grid', () => {
      const settings = Settings.create({
        userId: 'user-1',
        language: 'it',
        qdcApiKey: null,
        ifarmingApiKey: null,
        tablesViewMode: 'not-a-valid-mode',
        whatsappInstanceName: null,
        whatsappApiKey: null,
        whatsappInstanceId: null,
        whatsappConnected: false,
        whatsappPhoneNumber: null,
        whatsappQrCode: null,
        whatsappLastSync: null,
        whatsappAllowedNumbers: [],
      });
      expect(settings.tablesViewMode).toBe('grid');
    });

    it('should apply excel when explicitly requested', () => {
      const settings = createTestSettings('s1', 'u1', 'it', null, null);
      const updated = settings.withTablesViewMode('excel');
      expect(updated.tablesViewMode).toBe('excel');
      expect(updated).not.toBe(settings);
      expect(settings.tablesViewMode).toBe('grid');
    });

    it('should reject invalid tablesViewMode on update endpoint', async () => {
      const existing = createTestSettings('s1', 'user-1', 'it', null, null);
      mockRequest = {
        params: { id: 's1' },
        body: { tablesViewMode: 'bogus' },
        user: { id: 'user-1' },
      };
      mockRepository.findById.mockResolvedValue(existing);

      await expect(
        controller.update(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should persist excel view mode on update', async () => {
      const existing = createTestSettings('s1', 'user-1', 'it', null, null);
      const updated = existing.withTablesViewMode('excel');
      mockRequest = {
        params: { id: 's1' },
        body: { tablesViewMode: 'excel' },
        user: { id: 'user-1' },
      };
      mockRepository.findById.mockResolvedValue(existing);
      mockRepository.update.mockResolvedValue(updated);

      await controller.update(mockRequest as Request, mockResponse as Response);

      expect(mockRepository.update).toHaveBeenCalledWith('s1', { tablesViewMode: 'excel' });
    });
  });

  describe('delete', () => {
    it('should delete settings for owner', async () => {
      const existing = createTestSettings('s1', 'user-1', 'it', null, null);
      mockRequest = { params: { id: 's1' }, user: { id: 'user-1' } };
      mockRepository.findById.mockResolvedValue(existing);
      mockRepository.delete.mockResolvedValue();

      await controller.delete(mockRequest as Request, mockResponse as Response);

      expect(mockRepository.delete).toHaveBeenCalledWith('s1');
      expect(mockResponse.status).toHaveBeenCalledWith(204);
      expect(mockResponse.send).toHaveBeenCalled();
    });

    it('should throw when settings not found', async () => {
      mockRequest = { params: { id: 's1' }, user: { id: 'user-1' } };
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        controller.delete(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });

    it('should forbid delete when not owner', async () => {
      const existing = createTestSettings('s1', 'user-2', 'it', null, null);
      mockRequest = { params: { id: 's1' }, user: { id: 'user-1' } };
      mockRepository.findById.mockResolvedValue(existing);

      await expect(
        controller.delete(mockRequest as Request, mockResponse as Response),
      ).rejects.toThrow(AppError);
    });
  });
});
