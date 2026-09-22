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
      });});});});
