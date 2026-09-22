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
      });});});});
