import { prisma, cleanupTestData } from './setup';
import { createTestUser, createTestCompany, deleteTestUser, deleteTestCompany, deleteAllTestCompanies } from './helpers';
import { PrismaProductionUnitRepository } from '../infrastructure/repositories/PrismaProductionUnitRepository';
import { CreateProductionUnitUseCase } from '../application/use-cases/production-unit/CreateProductionUnitUseCase';
import { UpdateProductionUnitUseCase } from '../application/use-cases/production-unit/UpdateProductionUnitUseCase';
import { Field } from '../domain/entities/Field';
import { PrismaFieldRepository } from '../infrastructure/repositories/PrismaFieldRepository';
describe('ProductionUnit Integration', () => {
  let testUserId: string;
  let testCompanyId: string;
  let testFieldId: string;
  let repo: PrismaProductionUnitRepository;

  beforeAll(async () => {
    repo = new PrismaProductionUnitRepository(prisma);
    const tu = await createTestUser();
    testUserId = tu.id!;
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
    // Create a field with sauHa
    const fieldRepo = new PrismaFieldRepository(prisma);
    const field = Field.create({
      companyId: testCompanyId,
      name: `F-${Date.now()}`,
      coordinates: [],
      latitude: null,
      longitude: null,
      polygon: null,
      gisHa: null,
      sauHa: 10,
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
      address: 'Addr',
      cap: null,
      variazioneMq: null,
      inizioConduzione: null,
      fineConduzione: null,
      bufferZoneNotes: null,
    });
    const createdField = await fieldRepo.create(field);
    testFieldId = createdField.id;
  });

  it('should create PUs within available area and reject exceeding ones', async () => {
    const fieldRepository = new PrismaFieldRepository(prisma);
    const createUseCase = new CreateProductionUnitUseCase(repo, fieldRepository);
    const pu1 = await createUseCase.execute({
      allocations: [{ fieldId: testFieldId, areaHa: 3 }],
      name: 'PU1',
      cropName: 'Crop A',
      cropType: 'CT',
      variety: 'V',
      protocoll: 'P',
      areaHa: 3,
      protectionStructure: 'N',
      startDate: new Date('2025-01-01'),
      floweringDate: new Date('2025-02-01'),
      harvestingDate: new Date('2025-03-01'),
      endDate: new Date('2025-04-01'),
      acquaTotalePeridoL: 10,
    });
    expect(pu1.productionUnit.areaHa).toBe(3);

    const pu2 = await createUseCase.execute({
      allocations: [{ fieldId: testFieldId, areaHa: 7 }],
      name: 'PU2',
      cropName: 'Crop A',
      cropType: 'CT',
      variety: 'V',
      protocoll: 'P',
      areaHa: 7,
      protectionStructure: 'N',
      startDate: new Date('2025-01-15'),
      floweringDate: new Date('2025-02-10'),
      harvestingDate: new Date('2025-03-10'),
      endDate: new Date('2025-04-10'),
      acquaTotalePeridoL: 20,
    });
    expect(pu2.productionUnit.areaHa).toBe(7);

    await expect(
      createUseCase.execute({
        allocations: [{ fieldId: testFieldId, areaHa: 1 }],
        name: 'PU3',
        cropName: 'Crop A',
        cropType: 'CT',
        variety: 'V',
        protocoll: 'P',
        areaHa: 1,
        protectionStructure: 'N',
        startDate: new Date('2025-01-20'),
        floweringDate: new Date('2025-02-15'),
        harvestingDate: new Date('2025-03-15'),
        endDate: new Date('2025-04-15'),
        acquaTotalePeridoL: 5,
      }),
    ).rejects.toThrow();
  });

  it('should allow creation when ranges do not overlap even if global sum exceeds sauHa', async () => {
    const fieldRepository = new PrismaFieldRepository(prisma);
    const createUseCase = new CreateProductionUnitUseCase(repo, fieldRepository);

    const pu1 = await createUseCase.execute({
      allocations: [{ fieldId: testFieldId, areaHa: 6 }],
      name: 'PU-A',
      cropName: 'Crop A',
      cropType: 'CT',
      variety: 'V',
      protocoll: 'P',
      areaHa: 6,
      protectionStructure: 'N',
      startDate: new Date('2025-01-01'),
      floweringDate: new Date('2025-01-10'),
      harvestingDate: new Date('2025-01-20'),
      endDate: new Date('2025-01-31'),
      acquaTotalePeridoL: 10,
    });
    expect(pu1.productionUnit.areaHa).toBe(6);

    // Non overlapping: starts after previous ended
    const pu2 = await createUseCase.execute({
      allocations: [{ fieldId: testFieldId, areaHa: 6 }],
      name: 'PU-B',
      cropName: 'Crop A',
      cropType: 'CT',
      variety: 'V',
      protocoll: 'P',
      areaHa: 6,
      protectionStructure: 'N',
      startDate: new Date('2025-03-01'),
      floweringDate: new Date('2025-03-10'),
      harvestingDate: new Date('2025-03-20'),
      endDate: new Date('2025-03-31'),
      acquaTotalePeridoL: 10,
    });
    expect(pu2.productionUnit.areaHa).toBe(6);
  });

  it('should reject update that causes overlapping sum to exceed sauHa', async () => {
    const fieldRepository = new PrismaFieldRepository(prisma);
    const createUseCase = new CreateProductionUnitUseCase(repo, fieldRepository);
    const updateUseCase = new UpdateProductionUnitUseCase(repo, fieldRepository);

    const pu1 = await createUseCase.execute({
      allocations: [{ fieldId: testFieldId, areaHa: 5 }],
      name: 'PU-U1',
      cropName: 'Crop A',
      cropType: 'CT',
      variety: 'V',
      protocoll: 'P',
      areaHa: 5,
      protectionStructure: 'N',
      startDate: new Date('2025-04-01'),
      floweringDate: new Date('2025-04-10'),
      harvestingDate: new Date('2025-04-20'),
      endDate: new Date('2025-04-30'),
      acquaTotalePeridoL: 10,
    });
    expect(pu1.productionUnit.areaHa).toBe(5);

    const pu2 = await createUseCase.execute({
      allocations: [{ fieldId: testFieldId, areaHa: 5 }],
      name: 'PU-U2',
      cropName: 'Crop A',
      cropType: 'CT',
      variety: 'V',
      protocoll: 'P',
      areaHa: 5,
      protectionStructure: 'N',
      startDate: new Date('2025-04-05'),
      floweringDate: new Date('2025-04-12'),
      harvestingDate: new Date('2025-04-22'),
      endDate: new Date('2025-04-28'),
      acquaTotalePeridoL: 10,
    });

    // Try to increase PU2 to exceed 10 (5 + 6 > 10) within overlapping range
    await expect(
      updateUseCase.execute({ id: pu2.productionUnit.id, data: { areaHa: 6 } }),
    ).rejects.toThrow();
  });});
