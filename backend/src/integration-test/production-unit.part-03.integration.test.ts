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

  it('should update allocations moving area from field1 to field2 when checks pass', async () => {
    const fieldRepository = new PrismaFieldRepository(prisma);
    const createUseCase = new CreateProductionUnitUseCase(repo, fieldRepository);
    const updateUseCase = new UpdateProductionUnitUseCase(repo, fieldRepository);

    // create second field
    const f2 = await fieldRepository.create(
      Field.create({
        companyId: testCompanyId,
        name: `F2B-${Date.now()}`,
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
        foglio: '30',
        particella: '300',
        subalterno: null,
        nation: null,
        region: null,
        city: null,
        address: 'Addr3',
        cap: null,
        variazioneMq: null,
        inizioConduzione: null,
        fineConduzione: null,
        bufferZoneNotes: null,
      }),
    );

    // Existing on field1 occupying 7 ha
    await createUseCase.execute({
      allocations: [{ fieldId: testFieldId, areaHa: 7 }],
      name: 'PU-exist',
      cropName: 'E',
      cropType: 'CT',
      variety: 'V',
      protocoll: 'P',
      areaHa: 7,
      protectionStructure: 'N',
      startDate: new Date('2026-02-01'),
      floweringDate: new Date('2026-02-10'),
      harvestingDate: new Date('2026-03-10'),
      endDate: new Date('2026-03-30'),
      acquaTotalePeridoL: 10,
    });

    const created = await createUseCase.execute({
      allocations: [{ fieldId: testFieldId, areaHa: 3 }],
      name: 'PU-move',
      cropName: 'Move',
      cropType: 'CT',
      variety: 'V',
      protocoll: 'P',
      areaHa: 3,
      protectionStructure: 'N',
      startDate: new Date('2026-02-15'),
      floweringDate: new Date('2026-02-20'),
      harvestingDate: new Date('2026-03-20'),
      endDate: new Date('2026-03-25'),
      acquaTotalePeridoL: 10,
    });

    const updated = await updateUseCase.execute({
      id: created.productionUnit.id,
      data: {
        areaHa: 3,
        allocations: [
          { fieldId: testFieldId, areaHa: 1 },
          { fieldId: f2.id, areaHa: 2 },
        ],
      },
    });
    expect(updated.productionUnit.areaHa).toBe(3);
  });

  it('should reject update when new allocations exceed per-field sauHa', async () => {
    const fieldRepository = new PrismaFieldRepository(prisma);
    const createUseCase = new CreateProductionUnitUseCase(repo, fieldRepository);
    const updateUseCase = new UpdateProductionUnitUseCase(repo, fieldRepository);

    // Existing 9ha on field1
    await createUseCase.execute({
      allocations: [{ fieldId: testFieldId, areaHa: 9 }],
      name: 'PU-exist2',
      cropName: 'E2',
      cropType: 'CT',
      variety: 'V',
      protocoll: 'P',
      areaHa: 9,
      protectionStructure: 'N',
      startDate: new Date('2026-04-01'),
      floweringDate: new Date('2026-04-10'),
      harvestingDate: new Date('2026-05-10'),
      endDate: new Date('2026-05-30'),
      acquaTotalePeridoL: 10,
    });
    const created = await createUseCase.execute({
      allocations: [{ fieldId: testFieldId, areaHa: 1 }],
      name: 'PU-upd-bad',
      cropName: 'U',
      cropType: 'CT',
      variety: 'V',
      protocoll: 'P',
      areaHa: 1,
      protectionStructure: 'N',
      startDate: new Date('2026-04-15'),
      floweringDate: new Date('2026-04-20'),
      harvestingDate: new Date('2026-05-20'),
      endDate: new Date('2026-05-25'),
      acquaTotalePeridoL: 5,
    });
    await expect(
      updateUseCase.execute({
        id: created.productionUnit.id,
        data: { areaHa: 2, allocations: [{ fieldId: testFieldId, areaHa: 2 }] },
      }),
    ).rejects.toThrow();
  });});
