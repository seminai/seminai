import { PrismaFieldRepository } from '../infrastructure/repositories/PrismaFieldRepository';
import { PrismaProductionUnitRepository } from '../infrastructure/repositories/PrismaProductionUnitRepository';
import { prisma, cleanupTestData } from './setup';
import { createTestUser, createTestCompany, deleteTestUser, deleteTestCompany, deleteAllTestCompanies } from './helpers';
import { Field } from '../domain/entities/Field';
import { ProductionUnit } from '../domain/entities/ProductionUnit';
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

    it('should not return fully occupied fields', async () => {
      const fieldRepo = new PrismaFieldRepository(prisma);
      const puRepo = new PrismaProductionUnitRepository(prisma);
      const fieldFullyOccupied = Field.create({
        companyId: testCompanyId,
        name: `Field-fully-occupied-${Date.now()}`,
        coordinates: [],
        latitude: null,
        longitude: null,
        polygon: null,
        gisHa: null,
        sauHa: 5.0,
        ph: null,
        nitrogen: null,
        phosphorus: null,
        potassium: null,
        calcium: null,
        magnesium: null,
        soilType: null,
        uso: null,
        qualita: null,
        superficieCatastaleMq: 50000,
        sezione: 'B',
        foglio: '2',
        particella: '2',
        subalterno: null,
        nation: null,
        region: null,
        city: null,
        address: 'Via Test 2',
        cap: null,
        variazioneMq: null,
        inizioConduzione: null,
        fineConduzione: null,
        bufferZoneNotes: null,
      });
      const createdField = await fieldRepo.create(fieldFullyOccupied);
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-12-31');
      const productionUnit = ProductionUnit.create({
        name: 'PU Full',
        cropName: 'Corn',
        cropType: 'Cereal',
        variety: 'Type B',
        protocoll: 'Standard',
        areaHa: 5.0,
        protectionStructure: 'None',
        startDate,
        floweringDate: new Date('2025-05-01'),
        harvestingDate: new Date('2025-08-01'),
        endDate,
        acquaTotalePeridoL: 2000,
      });
      await puRepo.create(productionUnit, [{ fieldId: createdField.id, areaHaOnField: 5.0 }]);
      const useCase = new GetFieldsAvailabilityUseCase(fieldRepo, puRepo);
      const result = await useCase.execute({
        userId: testUserId,
        startAt: startDate,
        endAt: endDate,
      });
      const company = result.find((c) => c.companyId === testCompanyId);
      if (company) {
        const field = company.fields.find((f) => f.id === createdField.id);
        expect(field).toBeUndefined();
      }
    });});});
