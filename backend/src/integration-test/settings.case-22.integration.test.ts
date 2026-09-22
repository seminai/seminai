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

    describe('Delete Operations', () => {

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
      });});});});
