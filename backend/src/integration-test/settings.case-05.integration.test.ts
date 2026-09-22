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

    describe('Read Operations', () => {

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
      });});});});
