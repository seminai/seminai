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
    it('should return fields with available area in date range', async () => {
      const fieldRepo = new PrismaFieldRepository(prisma);
      const puRepo = new PrismaProductionUnitRepository(prisma);
      const fieldWithSpace = Field.create({
        companyId: testCompanyId,
        name: `Field-with-space-${Date.now()}`,
        coordinates: [],
        latitude: null,
        longitude: null,
        polygon: null,
        gisHa: null,
        sauHa: 10.0,
        ph: null,
        nitrogen: null,
        phosphorus: null,
        potassium: null,
        calcium: null,
        magnesium: null,
        soilType: null,
        uso: null,
        qualita: null,
        superficieCatastaleMq: 100000,
        sezione: 'A',
        foglio: '1',
        particella: '1',
        subalterno: null,
        nation: null,
        region: null,
        city: null,
        address: 'Via Test 1',
        cap: null,
        variazioneMq: null,
        inizioConduzione: null,
        fineConduzione: null,
        bufferZoneNotes: null,
      });
      const createdField = await fieldRepo.create(fieldWithSpace);
      const currentYear = new Date().getFullYear();
      const startDate = new Date(currentYear, 0, 1);
      const endDate = new Date(currentYear, 11, 31);
      const productionUnit = ProductionUnit.create({
        name: 'PU Test',
        cropName: 'Wheat',
        cropType: 'Cereal',
        variety: 'Type A',
        protocoll: 'Standard',
        areaHa: 3.0,
        protectionStructure: 'None',
        startDate,
        floweringDate: new Date(currentYear, 4, 1),
        harvestingDate: new Date(currentYear, 7, 1),
        endDate,
        acquaTotalePeridoL: 1000,
      });
      await puRepo.create(productionUnit, [{ fieldId: createdField.id, areaHaOnField: 3.0 }]);
      const useCase = new GetFieldsAvailabilityUseCase(fieldRepo, puRepo);
      const result = await useCase.execute({
        userId: testUserId,
        startAt: startDate,
        endAt: endDate,
      });
      expect(result.length).toBeGreaterThan(0);
      const company = result.find((c) => c.companyId === testCompanyId);
      expect(company).toBeDefined();
      expect(company!.fields.length).toBeGreaterThan(0);
      const field = company!.fields.find((f) => f.id === createdField.id);
      expect(field).toBeDefined();
      expect(field!.sauHa).toBe(10.0);
      expect(field!.areaOccupied).toBe(3.0);
      expect(field!.areaAvailable).toBe(7.0);
    });});});
