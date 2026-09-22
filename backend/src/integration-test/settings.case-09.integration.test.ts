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
      });});});});
