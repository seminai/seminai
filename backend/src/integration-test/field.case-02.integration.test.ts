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

  describe('Bulk Create', () => {
    it('should create many fields at once', async () => {
      const items = [
        Field.create({
          companyId: testCompanyId,
          name: `F1-${Date.now()}`,
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
          superficieCatastaleMq: 1,
          sezione: 'S',
          foglio: '10',
          particella: '100',
          subalterno: null,
          nation: null,
          region: null,
          city: null,
          address: 'Addr1',
          cap: null,
          variazioneMq: null,
          inizioConduzione: null,
          fineConduzione: null,
          bufferZoneNotes: null,
        }),
        Field.create({
          companyId: testCompanyId,
          name: `F2-${Date.now()}`,
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
          superficieCatastaleMq: 2,
          sezione: 'S',
          foglio: '11',
          particella: '101',
          subalterno: null,
          nation: null,
          region: null,
          city: null,
          address: 'Addr2',
          cap: null,
          variazioneMq: null,
          inizioConduzione: null,
          fineConduzione: null,
          bufferZoneNotes: null,
        }),
      ];
      await fieldRepository.createMany(items);
      const list = await fieldRepository.findManyByCompanyId(testCompanyId);
      expect(list.length).toBe(2);
    });});});
