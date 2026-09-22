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
      });});});});
