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
      });});});});
