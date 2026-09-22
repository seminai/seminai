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

    describe('Open-Meteo Integration', () => {
      it('should not affect other Settings flags when toggling Open-Meteo', async () => {
        const inputSettings = createSettingsInput({
          userId: testUserId,
          language: 'it',
          qdcApiKey: 'qdc-key',
          ifarmingApiKey: 'ifa-key',
        });
        const created = await settingsRepository.create(Settings.create(inputSettings));
        await settingsRepository.updateEmailIngestionEnabled(created.id, true);
        const updated = await settingsRepository.updateOpenMeteoEnabled(created.id, true);
        expect(updated.isOpenMeteoEnabled()).toBe(true);
        expect(updated.isEmailIngestionEnabled()).toBe(true);
        expect(updated.qdcApiKey).toBe('qdc-key');
        expect(updated.ifarmingApiKey).toBe('ifa-key');
        expect(updated.language).toBe('it');
      });});});});
