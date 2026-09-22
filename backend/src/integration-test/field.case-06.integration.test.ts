import { PrismaFieldRepository } from '../infrastructure/repositories/PrismaFieldRepository';
import { PrismaProductionUnitRepository } from '../infrastructure/repositories/PrismaProductionUnitRepository';
import { prisma, cleanupTestData } from './setup';
import { createTestUser, createTestCompany, deleteTestUser, deleteTestCompany, deleteAllTestCompanies } from './helpers';
import { Field } from '../domain/entities/Field';
import { GetFieldsAvailabilityUseCase } from '../application/use-cases/field/GetFieldsAvailabilityUseCase';
describe('Field Integration Tests', () => {
  let testUserId: string;
  let testCompanyId: string;

  beforeAll(async () => {
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

  describe('Field Availability', () => {

    it('should fall back to superficieCatastaleMq when sauHa and gisHa are missing', async () => {
      const fieldRepo = new PrismaFieldRepository(prisma);
      const puRepo = new PrismaProductionUnitRepository(prisma);
      const fieldWithOnlyCadastralArea = Field.create({
        companyId: testCompanyId,
        name: `Field-cadastral-only-${Date.now()}`,
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
        superficieCatastaleMq: 10000,
        sezione: 'D',
        foglio: '4',
        particella: '4',
        subalterno: null,
        nation: null,
        region: null,
        city: null,
        address: 'Via Test 4',
        cap: null,
        variazioneMq: null,
        inizioConduzione: null,
        fineConduzione: null,
        bufferZoneNotes: null,
      });
      const createdField = await fieldRepo.create(fieldWithOnlyCadastralArea);
      const useCase = new GetFieldsAvailabilityUseCase(fieldRepo, puRepo);
      const currentYear = new Date().getFullYear();
      const result = await useCase.execute({
        userId: testUserId,
        startAt: new Date(currentYear, 0, 1),
        endAt: new Date(currentYear, 11, 31),
      });
      const company = result.find((c) => c.companyId === testCompanyId);
      expect(company).toBeDefined();
      const field = company!.fields.find((f) => f.id === createdField.id);
      expect(field).toBeDefined();
      expect(field!.sauHa).toBe(1.0);
    });});});
