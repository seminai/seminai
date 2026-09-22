import { prisma, cleanupTestData } from './setup';
import { createTestUser, createTestCompany, deleteTestUser, deleteTestCompany, deleteAllTestCompanies } from './helpers';
import { PrismaProductionUnitRepository } from '../infrastructure/repositories/PrismaProductionUnitRepository';
import { CreateProductionUnitUseCase } from '../application/use-cases/production-unit/CreateProductionUnitUseCase';
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

  it('should create a PU across two fields when allocations sum equals areaHa and per-field checks pass', async () => {
    const fieldRepository = new PrismaFieldRepository(prisma);
    const createUseCase = new CreateProductionUnitUseCase(repo, fieldRepository);

    // Create second field (sauHa 8)
    const field2 = Field.create({
      companyId: testCompanyId,
      name: `F2-${Date.now()}`,
      coordinates: [],
      latitude: null,
      longitude: null,
      polygon: null,
      gisHa: null,
      sauHa: 8,
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
      foglio: '20',
      particella: '200',
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
    });
    const createdField2 = await fieldRepository.create(field2);

    // Existing PU on field1 occupying 4 ha
    await createUseCase.execute({
      allocations: [{ fieldId: testFieldId, areaHa: 4 }],
      name: 'PU-base',
      cropName: 'Base',
      cropType: 'CT',
      variety: 'V',
      protocoll: 'P',
      areaHa: 4,
      protectionStructure: 'N',
      startDate: new Date('2025-05-01'),
      floweringDate: new Date('2025-05-10'),
      harvestingDate: new Date('2025-06-10'),
      endDate: new Date('2025-06-30'),
      acquaTotalePeridoL: 10,
    });

    // New multi-field PU with allocations 3 (field1) + 2 (field2) = 5 ha total
    const created = await createUseCase.execute({
      allocations: [
        { fieldId: testFieldId, areaHa: 3 },
        { fieldId: createdField2.id, areaHa: 2 },
      ],
      name: 'PU-multi',
      cropName: 'Multi',
      cropType: 'CT',
      variety: 'V',
      protocoll: 'P',
      areaHa: 5,
      protectionStructure: 'N',
      startDate: new Date('2025-05-15'),
      floweringDate: new Date('2025-05-20'),
      harvestingDate: new Date('2025-06-20'),
      endDate: new Date('2025-06-25'),
      acquaTotalePeridoL: 10,
    });
    expect(created.productionUnit.areaHa).toBe(5);
  });

  it('should reject create when allocations sum does not equal areaHa', async () => {
    const fieldRepository = new PrismaFieldRepository(prisma);
    const createUseCase = new CreateProductionUnitUseCase(repo, fieldRepository);
    await expect(
      createUseCase.execute({
        allocations: [{ fieldId: testFieldId, areaHa: 2 }],
        name: 'PU-bad-sum',
        cropName: 'Bad',
        cropType: 'CT',
        variety: 'V',
        protocoll: 'P',
        areaHa: 3, // mismatch
        protectionStructure: 'N',
        startDate: new Date('2025-07-01'),
        floweringDate: new Date('2025-07-10'),
        harvestingDate: new Date('2025-08-10'),
        endDate: new Date('2025-08-30'),
        acquaTotalePeridoL: 10,
      }),
    ).rejects.toThrow();
  });

  it('should reject create when per-field overlapping sum exceeds sauHa', async () => {
    const fieldRepository = new PrismaFieldRepository(prisma);
    const createUseCase = new CreateProductionUnitUseCase(repo, fieldRepository);
    // Existing 9 ha on field -> leaves 1 ha
    await createUseCase.execute({
      allocations: [{ fieldId: testFieldId, areaHa: 9 }],
      name: 'PU-heavy',
      cropName: 'H',
      cropType: 'CT',
      variety: 'V',
      protocoll: 'P',
      areaHa: 9,
      protectionStructure: 'N',
      startDate: new Date('2025-09-01'),
      floweringDate: new Date('2025-09-10'),
      harvestingDate: new Date('2025-10-10'),
      endDate: new Date('2025-10-30'),
      acquaTotalePeridoL: 10,
    });
    await expect(
      createUseCase.execute({
        allocations: [{ fieldId: testFieldId, areaHa: 2 }],
        name: 'PU-exceed',
        cropName: 'E',
        cropType: 'CT',
        variety: 'V',
        protocoll: 'P',
        areaHa: 2,
        protectionStructure: 'N',
        startDate: new Date('2025-09-15'),
        floweringDate: new Date('2025-09-20'),
        harvestingDate: new Date('2025-10-20'),
        endDate: new Date('2025-10-25'),
        acquaTotalePeridoL: 10,
      }),
    ).rejects.toThrow();
  });

  it('should reject create when dates are adjacent (inclusive overlap) and sum would exceed sauHa', async () => {
    const fieldRepository = new PrismaFieldRepository(prisma);
    const createUseCase = new CreateProductionUnitUseCase(repo, fieldRepository);
    await createUseCase.execute({
      allocations: [{ fieldId: testFieldId, areaHa: 10 }],
      name: 'PU-full',
      cropName: 'Full',
      cropType: 'CT',
      variety: 'V',
      protocoll: 'P',
      areaHa: 10,
      protectionStructure: 'N',
      startDate: new Date('2025-11-01'),
      floweringDate: new Date('2025-11-10'),
      harvestingDate: new Date('2025-11-20'),
      endDate: new Date('2025-11-30'),
      acquaTotalePeridoL: 10,
    });
    await expect(
      createUseCase.execute({
        allocations: [{ fieldId: testFieldId, areaHa: 1 }],
        name: 'PU-adj',
        cropName: 'Adj',
        cropType: 'CT',
        variety: 'V',
        protocoll: 'P',
        areaHa: 1,
        protectionStructure: 'N',
        startDate: new Date('2025-11-30'), // equals previous end -> considered overlapping by rule (lte/gte)
        floweringDate: new Date('2025-12-05'),
        harvestingDate: new Date('2026-01-05'),
        endDate: new Date('2026-01-10'),
        acquaTotalePeridoL: 5,
      }),
    ).rejects.toThrow();
  });});
