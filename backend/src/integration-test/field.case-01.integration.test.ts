import { PrismaFieldRepository } from '../infrastructure/repositories/PrismaFieldRepository';
import { prisma, cleanupTestData } from './setup';
import { createTestUser, createTestCompany, deleteTestUser, deleteTestCompany, deleteAllTestCompanies } from './helpers';
import { Field } from '../domain/entities/Field';
describe('Field Integration Tests', () => {
  let fieldRepository: PrismaFieldRepository;
  let testUserId: string;
  let testCompanyId: string;

  beforeAll(async () => {
    fieldRepository = new PrismaFieldRepository(prisma);
    const testUser = await createTestUser();
    testUserId = testUser.id!;
  });

  afterAll(async () => {
    await deleteTestCompany(testCompanyId);
    await deleteTestUser();
    await cleanupTestData();
  });

  beforeEach(async () => {
    await deleteAllTestCompanies(testUserId);
    const company = await createTestCompany({ userId: testUserId });
    testCompanyId = company.id!;
  });

  describe('Create and Read', () => {
    it('should create a field and read it back', async () => {
      const entity = Field.create({
        companyId: testCompanyId,
        name: `Field-${Date.now()}`,
        coordinates: [],
        latitude: null,
        longitude: null,
        polygon: null,
        gisHa: null,
        sauHa: null,
        ph: null,
        nitrogen: null,
        phosphorus: null,
        potassium: null,
        calcium: null,
        magnesium: null,
        soilType: null,
        uso: null,
        qualita: null,
        superficieCatastaleMq: 100,
        sezione: 'S',
        foglio: '10',
        particella: '100',
        subalterno: null,
        nation: null,
        region: null,
        city: null,
        address: 'Via Roma 1',
        cap: null,
        variazioneMq: null,
        inizioConduzione: null,
        fineConduzione: null,
        bufferZoneNotes: null,
      });
      const created = await fieldRepository.create(entity);
      const found = await fieldRepository.findById(created.id);
      expect(found?.id).toBe(created.id);
    });});});
