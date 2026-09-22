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
      });});});});
