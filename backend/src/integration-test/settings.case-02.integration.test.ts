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
      });});});});
