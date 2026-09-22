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

    it('should exclude fields whose conduction period does not overlap the requested range', async () => {
      const fieldRepo = new PrismaFieldRepository(prisma);
      const puRepo = new PrismaProductionUnitRepository(prisma);
      const fieldOutOfConductionPeriod = Field.create({
        companyId: testCompanyId,
        name: `Field-out-of-conduction-${Date.now()}`,
        coordinates: [],
        latitude: null,
        longitude: null,
        polygon: null,
        gisHa: null,
        sauHa: 8.0,
        ph: null,
        nitrogen: null,
        phosphorus: null,
        potassium: null,
        calcium: null,
        magnesium: null,
        soilType: null,
        uso: null,
        qualita: null,
        superficieCatastaleMq: 80000,
        sezione: 'E',
        foglio: '5',
        particella: '5',
        subalterno: null,
        nation: null,
        region: null,
        city: null,
        address: 'Via Test 5',
        cap: null,
        variazioneMq: null,
        inizioConduzione: new Date('2020-01-01'),
        fineConduzione: new Date('2020-12-31'),
        bufferZoneNotes: null,
      });
      const createdField = await fieldRepo.create(fieldOutOfConductionPeriod);
      const useCase = new GetFieldsAvailabilityUseCase(fieldRepo, puRepo);
      const result = await useCase.execute({
        userId: testUserId,
        startAt: new Date('2025-01-01'),
        endAt: new Date('2025-12-31'),
      });
      const company = result.find((c) => c.companyId === testCompanyId);
      if (company) {
        const field = company.fields.find((f) => f.id === createdField.id);
        expect(field).toBeUndefined();
      }
    });});});
