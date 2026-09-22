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
      });});});});
