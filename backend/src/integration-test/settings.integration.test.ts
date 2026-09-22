import { PrismaSettingsRepository } from '../infrastructure/repositories/PrismaSettingsRepository';
import { prisma } from './setup';
import { createTestUser, deleteTestUser } from './helpers';
import { Settings } from '../domain/entities/Settings';

/**
 * Helper to create Settings input with default WhatsApp fields.
 */
function createSettingsInput(data: {
  userId: string;
  language: string;
  qdcApiKey: string | null;
  ifarmingApiKey: string | null;
}) {
  return {
    ...data,
    whatsappInstanceName: null,
    whatsappApiKey: null,
    whatsappInstanceId: null,
    whatsappConnected: false,
    whatsappPhoneNumber: null,
    whatsappQrCode: null,
    whatsappLastSync: null,
    whatsappAllowedNumbers: [],
  };
}

describe('Settings Integration Tests', () => {
  let settingsRepository: PrismaSettingsRepository;
  let testUserId: string;

  beforeAll(async () => {
    settingsRepository = new PrismaSettingsRepository(prisma);
    const testUser = await createTestUser();
    testUserId = testUser.id;
  });

  afterAll(async () => {
    await deleteTestUser();
  });

  beforeEach(async () => {
    const existing = await settingsRepository.findByUserId(testUserId);
    if (existing) {
      await settingsRepository.delete(existing.id);
    }
  });

  describe('Settings CRUD Operations', () => {
    describe('Create Operations', () => {
      it('should create settings successfully with all fields', async () => {
        const inputSettingsData = createSettingsInput({
          userId: testUserId,
          language: 'it',
          qdcApiKey: 'qdc-test-api-key-12345',
          ifarmingApiKey: 'ifarming-test-api-key-67890',
        });

        const settings = Settings.create(inputSettingsData);
        const actualCreatedSettings = await settingsRepository.create(settings);

        expect(actualCreatedSettings).toBeDefined();
        expect(actualCreatedSettings.id).toBeDefined();
        expect(actualCreatedSettings.userId).toBe(testUserId);
        expect(actualCreatedSettings.language).toBe('it');
        expect(actualCreatedSettings.qdcApiKey).toBe('qdc-test-api-key-12345');
        expect(actualCreatedSettings.ifarmingApiKey).toBe('ifarming-test-api-key-67890');

        const actualDbSettings = await settingsRepository.findById(actualCreatedSettings.id);
        expect(actualDbSettings).toBeDefined();
        expect(actualDbSettings?.language).toBe('it');
      });

      it('should create settings with only required fields', async () => {
        const inputMinimalSettings = createSettingsInput({
          userId: testUserId,
          language: 'en',
          qdcApiKey: null,
          ifarmingApiKey: null,
        });

        const settings = Settings.create(inputMinimalSettings);
        const actualCreatedSettings = await settingsRepository.create(settings);

        expect(actualCreatedSettings).toBeDefined();
        expect(actualCreatedSettings.language).toBe('en');
        expect(actualCreatedSettings.qdcApiKey).toBeNull();
        expect(actualCreatedSettings.ifarmingApiKey).toBeNull();
      });

      it('should create settings with different languages', async () => {
        const languages = ['it', 'en', 'fr', 'de', 'es'];

        for (const language of languages) {
          const s = await settingsRepository.findByUserId(testUserId);
          if (s) await settingsRepository.delete(s.id);

          const inputSettings = createSettingsInput({
            userId: testUserId,
            language,
            qdcApiKey: null,
            ifarmingApiKey: null,
          });

          const settings = Settings.create(inputSettings);
          const actualCreatedSettings = await settingsRepository.create(settings);

          expect(actualCreatedSettings.language).toBe(language);
        }
      });
    });

    describe('Read Operations', () => {
      it('should find settings by id', async () => {
        const inputSettings = createSettingsInput({
          userId: testUserId,
          language: 'it',
          qdcApiKey: 'test-qdc-key',
          ifarmingApiKey: null,
        });

        const settings = Settings.create(inputSettings);
        const createdSettings = await settingsRepository.create(settings);

        const actualFoundSettings = await settingsRepository.findById(createdSettings.id);

        expect(actualFoundSettings).toBeDefined();
        expect(actualFoundSettings?.id).toBe(createdSettings.id);
        expect(actualFoundSettings?.language).toBe('it');
        expect(actualFoundSettings?.qdcApiKey).toBe('test-qdc-key');
      });

      it('should find settings by userId', async () => {
        const inputSettings = createSettingsInput({
          userId: testUserId,
          language: 'en',
          qdcApiKey: 'test-key',
          ifarmingApiKey: 'test-ifarming',
        });

        const settings = Settings.create(inputSettings);
        await settingsRepository.create(settings);

        const actualFoundSettings = await settingsRepository.findByUserId(testUserId);

        expect(actualFoundSettings).toBeDefined();
        expect(actualFoundSettings?.userId).toBe(testUserId);
        expect(actualFoundSettings?.language).toBe('en');
        expect(actualFoundSettings?.qdcApiKey).toBe('test-key');
        expect(actualFoundSettings?.ifarmingApiKey).toBe('test-ifarming');
      });

      it('should return null when settings not found by id', async () => {
        const actualFoundSettings = await settingsRepository.findById('non-existent-id');

        expect(actualFoundSettings).toBeNull();
      });

      it('should return null when settings not found by userId', async () => {
        const actualFoundSettings = await settingsRepository.findByUserId('non-existent-user-id');

        expect(actualFoundSettings).toBeNull();
      });
    });

    describe('Update Operations', () => {
      it('should update all settings fields', async () => {
        const inputInitialSettings = createSettingsInput({
          userId: testUserId,
          language: 'it',
          qdcApiKey: 'old-qdc-key',
          ifarmingApiKey: 'old-ifarming-key',
        });

        const settings = Settings.create(inputInitialSettings);
        const createdSettings = await settingsRepository.create(settings);

        const inputUpdateData = {
          language: 'en',
          qdcApiKey: 'new-qdc-key',
          ifarmingApiKey: 'new-ifarming-key',
        };

        const actualUpdatedSettings = await settingsRepository.update(
          createdSettings.id,
          inputUpdateData,
        );

        expect(actualUpdatedSettings.language).toBe('en');
        expect(actualUpdatedSettings.qdcApiKey).toBe('new-qdc-key');
        expect(actualUpdatedSettings.ifarmingApiKey).toBe('new-ifarming-key');

        const actualDbSettings = await settingsRepository.findById(createdSettings.id);
        expect(actualDbSettings?.language).toBe('en');
        expect(actualDbSettings?.qdcApiKey).toBe('new-qdc-key');
      });

      it('should update only language', async () => {
        const inputSettings = createSettingsInput({
          userId: testUserId,
          language: 'it',
          qdcApiKey: 'my-qdc-key',
          ifarmingApiKey: 'my-ifarming-key',
        });

        const settings = Settings.create(inputSettings);
        const createdSettings = await settingsRepository.create(settings);

        const inputUpdateLanguage = {
          language: 'fr',
        };

        const actualUpdatedSettings = await settingsRepository.update(
          createdSettings.id,
          inputUpdateLanguage,
        );

        expect(actualUpdatedSettings.language).toBe('fr');
        expect(actualUpdatedSettings.qdcApiKey).toBe('my-qdc-key');
        expect(actualUpdatedSettings.ifarmingApiKey).toBe('my-ifarming-key');
      });

      it('should default tablesViewMode to grid when not provided', async () => {
        const inputSettings = createSettingsInput({
          userId: testUserId,
          language: 'it',
          qdcApiKey: null,
          ifarmingApiKey: null,
        });

        const settings = Settings.create(inputSettings);
        const createdSettings = await settingsRepository.create(settings);

        expect(createdSettings.tablesViewMode).toBe('grid');
      });

      it('should persist tablesViewMode update to excel', async () => {
        const inputSettings = createSettingsInput({
          userId: testUserId,
          language: 'it',
          qdcApiKey: null,
          ifarmingApiKey: null,
        });

        const settings = Settings.create(inputSettings);
        const createdSettings = await settingsRepository.create(settings);
        expect(createdSettings.tablesViewMode).toBe('grid');

        const actualUpdated = await settingsRepository.update(createdSettings.id, {
          tablesViewMode: 'excel',
        });

        expect(actualUpdated.tablesViewMode).toBe('excel');

        const actualDbSettings = await settingsRepository.findById(createdSettings.id);
        expect(actualDbSettings?.tablesViewMode).toBe('excel');
      });

      it('should update only API keys', async () => {
        const inputSettings = createSettingsInput({
          userId: testUserId,
          language: 'it',
          qdcApiKey: null,
          ifarmingApiKey: null,
        });

        const settings = Settings.create(inputSettings);
        const createdSettings = await settingsRepository.create(settings);

        const inputUpdateApiKeys = {
          qdcApiKey: 'new-qdc-api-key',
          ifarmingApiKey: 'new-ifarming-api-key',
        };

        const actualUpdatedSettings = await settingsRepository.update(
          createdSettings.id,
          inputUpdateApiKeys,
        );

        expect(actualUpdatedSettings.language).toBe('it');
        expect(actualUpdatedSettings.qdcApiKey).toBe('new-qdc-api-key');
        expect(actualUpdatedSettings.ifarmingApiKey).toBe('new-ifarming-api-key');
      });

      it('should clear API keys by setting to null', async () => {
        const inputSettings = createSettingsInput({
          userId: testUserId,
          language: 'it',
          qdcApiKey: 'existing-qdc-key',
          ifarmingApiKey: 'existing-ifarming-key',
        });

        const settings = Settings.create(inputSettings);
        const createdSettings = await settingsRepository.create(settings);

        const inputClearKeys = {
          qdcApiKey: null,
          ifarmingApiKey: null,
        };

        const actualUpdatedSettings = await settingsRepository.update(
          createdSettings.id,
          inputClearKeys,
        );

        expect(actualUpdatedSettings.qdcApiKey).toBeNull();
        expect(actualUpdatedSettings.ifarmingApiKey).toBeNull();
        expect(actualUpdatedSettings.language).toBe('it');
      });
    });

    describe('Open-Meteo Integration', () => {
      it('should default openMeteoEnabled to false on create', async () => {
        const inputSettings = createSettingsInput({
          userId: testUserId,
          language: 'it',
          qdcApiKey: null,
          ifarmingApiKey: null,
        });
        const settings = Settings.create(inputSettings);
        const createdSettings = await settingsRepository.create(settings);
        expect(createdSettings.isOpenMeteoEnabled()).toBe(false);
        const dbSettings = await settingsRepository.findById(createdSettings.id);
        expect(dbSettings?.isOpenMeteoEnabled()).toBe(false);
      });
      it('should enable Open-Meteo and persist the flag', async () => {
        const inputSettings = createSettingsInput({
          userId: testUserId,
          language: 'it',
          qdcApiKey: null,
          ifarmingApiKey: null,
        });
        const created = await settingsRepository.create(Settings.create(inputSettings));
        const updated = await settingsRepository.updateOpenMeteoEnabled(created.id, true);
        expect(updated.isOpenMeteoEnabled()).toBe(true);
        const dbSettings = await settingsRepository.findById(created.id);
        expect(dbSettings?.isOpenMeteoEnabled()).toBe(true);
      });
      it('should disable Open-Meteo after enabling and persist the flag', async () => {
        const inputSettings = createSettingsInput({
          userId: testUserId,
          language: 'it',
          qdcApiKey: null,
          ifarmingApiKey: null,
        });
        const created = await settingsRepository.create(Settings.create(inputSettings));
        await settingsRepository.updateOpenMeteoEnabled(created.id, true);
        const disabled = await settingsRepository.updateOpenMeteoEnabled(created.id, false);
        expect(disabled.isOpenMeteoEnabled()).toBe(false);
        const dbSettings = await settingsRepository.findById(created.id);
        expect(dbSettings?.isOpenMeteoEnabled()).toBe(false);
      });
      it('should be idempotent when enabling twice', async () => {
        const inputSettings = createSettingsInput({
          userId: testUserId,
          language: 'it',
          qdcApiKey: null,
          ifarmingApiKey: null,
        });
        const created = await settingsRepository.create(Settings.create(inputSettings));
        await settingsRepository.updateOpenMeteoEnabled(created.id, true);
        const second = await settingsRepository.updateOpenMeteoEnabled(created.id, true);
        expect(second.isOpenMeteoEnabled()).toBe(true);
      });
      it('should not affect other Settings flags when toggling Open-Meteo', async () => {
        const inputSettings = createSettingsInput({
          userId: testUserId,
          language: 'it',
          qdcApiKey: 'qdc-key',
          ifarmingApiKey: 'ifa-key',
        });
        const created = await settingsRepository.create(Settings.create(inputSettings));
        await settingsRepository.updateEmailIngestionEnabled(created.id, true);
        const updated = await settingsRepository.updateOpenMeteoEnabled(created.id, true);
        expect(updated.isOpenMeteoEnabled()).toBe(true);
        expect(updated.isEmailIngestionEnabled()).toBe(true);
        expect(updated.qdcApiKey).toBe('qdc-key');
        expect(updated.ifarmingApiKey).toBe('ifa-key');
        expect(updated.language).toBe('it');
      });
      it('Open-Meteo flag passed at create time is persisted', async () => {
        const inputSettings = createSettingsInput({
          userId: testUserId,
          language: 'it',
          qdcApiKey: null,
          ifarmingApiKey: null,
        });
        const created = await settingsRepository.create(
          Settings.create({ ...inputSettings, openMeteoEnabled: true }),
        );
        expect(created.isOpenMeteoEnabled()).toBe(true);
        const dbSettings = await settingsRepository.findById(created.id);
        expect(dbSettings?.isOpenMeteoEnabled()).toBe(true);
      });
      it('withOpenMeteoEnabled domain helper returns a new immutable instance', () => {
        const inputSettings = createSettingsInput({
          userId: testUserId,
          language: 'it',
          qdcApiKey: null,
          ifarmingApiKey: null,
        });
        const original = Settings.create(inputSettings);
        const enabled = original.withOpenMeteoEnabled(true);
        expect(enabled).not.toBe(original);
        expect(enabled.isOpenMeteoEnabled()).toBe(true);
        expect(original.isOpenMeteoEnabled()).toBe(false);
      });
    });

    describe('Delete Operations', () => {
      it('should delete settings successfully', async () => {
        const inputSettings = createSettingsInput({
          userId: testUserId,
          language: 'it',
          qdcApiKey: 'test-key',
          ifarmingApiKey: 'test-key',
        });

        const settings = Settings.create(inputSettings);
        const createdSettings = await settingsRepository.create(settings);

        await settingsRepository.delete(createdSettings.id);

        const actualDeletedSettings = await settingsRepository.findById(createdSettings.id);
        expect(actualDeletedSettings).toBeNull();

        const actualDbSettings = await settingsRepository.findById(createdSettings.id);
        expect(actualDbSettings).toBeNull();
      });

      it('should delete settings and allow recreation', async () => {
        const inputSettings = createSettingsInput({
          userId: testUserId,
          language: 'it',
          qdcApiKey: 'first-key',
          ifarmingApiKey: null,
        });

        const firstSettings = Settings.create(inputSettings);
        const createdFirstSettings = await settingsRepository.create(firstSettings);

        await settingsRepository.delete(createdFirstSettings.id);

        const inputNewSettings = createSettingsInput({
          userId: testUserId,
          language: 'en',
          qdcApiKey: 'second-key',
          ifarmingApiKey: null,
        });

        const newSettings = Settings.create(inputNewSettings);
        const actualNewSettings = await settingsRepository.create(newSettings);

        expect(actualNewSettings).toBeDefined();
        expect(actualNewSettings.id).not.toBe(createdFirstSettings.id);
        expect(actualNewSettings.language).toBe('en');
        expect(actualNewSettings.qdcApiKey).toBe('second-key');
      });
    });
  });
});
