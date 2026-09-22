import { PrismaFieldRepository } from '../infrastructure/repositories/PrismaFieldRepository';
import { PrismaProductionUnitRepository } from '../infrastructure/repositories/PrismaProductionUnitRepository';
import { prisma, cleanupTestData } from './setup';
import {
  createTestUser,
  createTestCompany,
  deleteTestUser,
  deleteTestCompany,
  deleteAllTestCompanies,
} from './helpers';
import { Field } from '../domain/entities/Field';
import { ProductionUnit } from '../domain/entities/ProductionUnit';
import { GetFieldsAvailabilityUseCase } from '../application/use-cases/field/GetFieldsAvailabilityUseCase';

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
    });
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
    });
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
    });

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
    });

    it('should exclude fields without any resolvable area (sauHa, gisHa, superficieCatastaleMq all missing)', async () => {
      const fieldRepo = new PrismaFieldRepository(prisma);
      const puRepo = new PrismaProductionUnitRepository(prisma);
      const fieldWithoutArea = Field.create({
        companyId: testCompanyId,
        name: `Field-no-area-${Date.now()}`,
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
        superficieCatastaleMq: null,
        sezione: 'C',
        foglio: '3',
        particella: '3',
        subalterno: null,
        nation: null,
        region: null,
        city: null,
        address: 'Via Test 3',
        cap: null,
        variazioneMq: null,
        inizioConduzione: null,
        fineConduzione: null,
        bufferZoneNotes: null,
      });
      await fieldRepo.create(fieldWithoutArea);
      const useCase = new GetFieldsAvailabilityUseCase(fieldRepo, puRepo);
      const currentYear = new Date().getFullYear();
      const result = await useCase.execute({
        userId: testUserId,
        startAt: new Date(currentYear, 0, 1),
        endAt: new Date(currentYear, 11, 31),
      });
      const company = result.find((c) => c.companyId === testCompanyId);
      if (company) {
        const field = company.fields.find((f) => f.id === fieldWithoutArea.id);
        expect(field).toBeUndefined();
      }
    });

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
    });

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
    });

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
    });
  });
});
