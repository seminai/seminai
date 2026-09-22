import { JobCategory } from '@prisma/client';
import { prisma, cleanupTestData } from './setup';
import {
  createTestUser,
  deleteTestUser,
  createTestCompany,
  deleteAllTestCompanies,
} from './helpers';
import { TEST_INVITE_CODE } from './constants';
import { PrismaJobRepository } from '../infrastructure/repositories/PrismaJobRepository';
import { PrismaUserRepository } from '../infrastructure/repositories/PrismaUserRepository';
import { PrismaProductionUnitRepository } from '../infrastructure/repositories/PrismaProductionUnitRepository';
import { PrismaFieldRepository } from '../infrastructure/repositories/PrismaFieldRepository';
import { PrismaUserOnCompanyRepository } from '../infrastructure/repositories/PrismaUserOnCompanyRepository';
import { Field } from '../domain/entities/Field';
import { ProductionUnit } from '../domain/entities/ProductionUnit';
import { CreateJobUseCase } from '../application/use-cases/job/CreateJobUseCase';
import { PrismaStockRepository } from '../infrastructure/repositories/PrismaStockRepository';
import { AssignUserToJobUseCase } from '../application/use-cases/job/AssignUserToJobUseCase';
import { RegisterUseCase } from '../application/use-cases/auth/RegisterUseCase';

describe('Assign User To Job - Integration', () => {
  let testUserId: string;
  let testCompanyId: string;
  let productionUnitId: string;
  let jobId: string;

  beforeAll(async () => {
    const tu = await createTestUser();
    testUserId = tu.id!;
  });

  beforeEach(async () => {
    await deleteAllTestCompanies(testUserId);
    const company = await createTestCompany({ userId: testUserId });
    testCompanyId = company.id!;

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

    const puRepo = new PrismaProductionUnitRepository(prisma);
    const pu = ProductionUnit.create({
      name: 'PU',
      cropName: 'Crop',
      cropType: 'CT',
      variety: 'V',
      protocoll: 'P',
      areaHa: 1,
      protectionStructure: 'N',
      startDate: new Date('2025-01-01'),
      floweringDate: new Date('2025-02-01'),
      harvestingDate: new Date('2025-03-01'),
      endDate: new Date('2025-04-01'),
      occupazione: null,
      destinazioneDiUso: null,
      acquaTotalePeridoL: 0,
    });
    const createdPu = await puRepo.create(pu, [{ fieldId: createdField.id, areaHaOnField: 1 }]);
    productionUnitId = createdPu.id;

    const jobRepository = new PrismaJobRepository(prisma);
    const stockRepository = new PrismaStockRepository(prisma);
    const createJob = new CreateJobUseCase(jobRepository, stockRepository);
    const { job } = await createJob.execute({
      productionUnitId,
      dateOfOpeation: new Date(),
      category: JobCategory.TREATMENT,
      quantity: 1,
      unitOfMeasureQuantity: 'L',
    });
    jobId = job.id;
  });

  afterAll(async () => {
    await deleteAllTestCompanies(testUserId);
    await deleteTestUser();
    await cleanupTestData();
  });

  it('assigns a user belonging to the company to the job', async () => {
    const userRepository = new PrismaUserRepository(prisma);
    const secondEmail = `assign-${Date.now()}@test.it`;
    const register = new RegisterUseCase(userRepository);
    const secondUser = await register.execute({
      email: secondEmail,
      password: 'Password123!',
      name: 'Op',
      inviteCode: TEST_INVITE_CODE,
    });

    // add second user to company
    const uocRepo = new PrismaUserOnCompanyRepository(prisma);
    await prisma.userOnCompany.create({
      data: {
        companyId: testCompanyId,
        userId: secondUser.id,
        role: 'EDITOR',
      },
    });

    const jobRepository = new PrismaJobRepository(prisma);
    const assign = new AssignUserToJobUseCase(
      jobRepository,
      userRepository,
      new PrismaProductionUnitRepository(prisma),
      new PrismaFieldRepository(prisma),
      uocRepo,
    );

    const { job } = await assign.execute({ jobId, userId: secondUser.id });
    expect(job.userId).toBe(secondUser.id);
  });

  it('fails if user does not belong to company', async () => {
    const userRepository = new PrismaUserRepository(prisma);
    const outsider = await new RegisterUseCase(userRepository).execute({
      email: `outsider-${Date.now()}@test.it`,
      password: 'Password123!',
      name: 'Out',
      inviteCode: TEST_INVITE_CODE,
    });

    const jobRepository = new PrismaJobRepository(prisma);
    const assign = new AssignUserToJobUseCase(
      jobRepository,
      userRepository,
      new PrismaProductionUnitRepository(prisma),
      new PrismaFieldRepository(prisma),
      new PrismaUserOnCompanyRepository(prisma),
    );

    await expect(assign.execute({ jobId, userId: outsider.id })).rejects.toThrow();
  });
});
