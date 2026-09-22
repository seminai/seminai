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

    it('should treat missing conduction dates as available for the current year (default)', async () => {
      const fieldRepo = new PrismaFieldRepository(prisma);
      const puRepo = new PrismaProductionUnitRepository(prisma);
      const currentYear = new Date().getFullYear();
      const fieldWithoutConductionDates = Field.create({
        companyId: testCompanyId,
        name: `Field-null-conduction-${Date.now()}`,
        coordinates: [],
        latitude: null,
        longitude: null,
        polygon: null,
        gisHa: null,
        sauHa: 4.0,
        ph: null,
        nitrogen: null,
        phosphorus: null,
        potassium: null,
        calcium: null,
        magnesium: null,
        soilType: null,
        uso: null,
        qualita: null,
        superficieCatastaleMq: 40000,
        sezione: 'F',
        foglio: '6',
        particella: '6',
        subalterno: null,
        nation: null,
        region: null,
        city: null,
        address: 'Via Test 6',
        cap: null,
        variazioneMq: null,
        inizioConduzione: null,
        fineConduzione: null,
        bufferZoneNotes: null,
      });
      const createdField = await fieldRepo.create(fieldWithoutConductionDates);
      const useCase = new GetFieldsAvailabilityUseCase(fieldRepo, puRepo);
      const result = await useCase.execute({
        userId: testUserId,
        startAt: new Date(currentYear, 0, 1),
        endAt: new Date(currentYear, 11, 31),
      });
      const company = result.find((c) => c.companyId === testCompanyId);
      expect(company).toBeDefined();
      const field = company!.fields.find((f) => f.id === createdField.id);
      expect(field).toBeDefined();
    });});});
