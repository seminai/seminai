/**
 * Cross-tenant IDOR checks on job HTTP handlers.
 *
 * Run:
 *   npm run test:int:fast -- --testPathPattern job-cross-tenant
 */
import { Request, Response } from 'express';
import { JobCategory } from '@prisma/client';
import { TEST_INVITE_CODE } from './constants';
import {
  createTestCompany,
  createTestUser,
  deleteAllTestCompanies,
  deleteTestUser,
  prisma,
} from './helpers';
import { RegisterUseCase } from '../application/use-cases/auth/RegisterUseCase';
import { CreateJobUseCase } from '../application/use-cases/job/CreateJobUseCase';
import { ListJobsGroupedByJobIdUseCase } from '../application/use-cases/job/ListJobsGroupedByJobIdUseCase';
import { Field } from '../domain/entities/Field';
import { ProductionUnit } from '../domain/entities/ProductionUnit';
import { JobController } from '../infrastructure/http/controllers/JobController';
import { createResourceAccessGuard } from '../infrastructure/http/access/create-resource-access-guard';
import { PrismaFieldRepository } from '../infrastructure/repositories/PrismaFieldRepository';
import { PrismaJobRepository } from '../infrastructure/repositories/PrismaJobRepository';
import { PrismaProductionUnitRepository } from '../infrastructure/repositories/PrismaProductionUnitRepository';
import { PrismaStockRepository } from '../infrastructure/repositories/PrismaStockRepository';
import { PrismaUserRepository } from '../infrastructure/repositories/PrismaUserRepository';

jest.setTimeout(60_000);

function createMockResponse(): Response {
  const response = {} as Response;
  response.status = jest.fn().mockReturnThis();
  response.json = jest.fn().mockReturnThis();
  return response;
}

describe('JobController cross-tenant access', () => {
  const jobRepository = new PrismaJobRepository(prisma);
  const stockRepository = new PrismaStockRepository(prisma);
  const controller = new JobController(
    jobRepository,
    stockRepository,
    createResourceAccessGuard(prisma),
  );
  let ownerId = '';
  let otherUserId = '';
  let ownerCompanyId = '';
  let jobId = '';

  beforeAll(async () => {
    const owner = await createTestUser();
    ownerId = owner.id;
    await deleteAllTestCompanies(ownerId);
    const ownerCompany = await createTestCompany({
      userId: ownerId,
      name: 'Owner Tenant SRL',
    });
    ownerCompanyId = ownerCompany.id;
    const other = await new RegisterUseCase(new PrismaUserRepository(prisma)).execute({
      email: `job-idor-${Date.now()}@example.com`,
      password: 'Password123!',
      name: 'Other Tenant User',
      inviteCode: TEST_INVITE_CODE,
    });
    otherUserId = other.id;
    const field = await new PrismaFieldRepository(prisma).create(
      Field.create({
        companyId: ownerCompanyId,
        name: `F-idor-${Date.now()}`,
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
      }),
    );
    const productionUnit = await new PrismaProductionUnitRepository(prisma).create(
      ProductionUnit.create({
        name: 'PU IDOR',
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
      }),
      [{ fieldId: field.id, areaHaOnField: 1 }],
    );
    const created = await new CreateJobUseCase(jobRepository, stockRepository).execute({
      productionUnitId: productionUnit.id,
      dateOfOpeation: new Date('2026-01-15T00:00:00.000Z'),
      category: JobCategory.TREATMENT,
      quantity: 1,
      unitOfMeasureQuantity: 'L',
      jobId: `group-${Date.now()}`,
    });
    jobId = created.job.id;
  });

  afterAll(async () => {
    if (ownerId) {
      await deleteAllTestCompanies(ownerId);
    }
    if (otherUserId) {
      await prisma.userOnCompany.deleteMany({ where: { userId: otherUserId } });
      await prisma.settings.deleteMany({ where: { userId: otherUserId } });
      await prisma.patentino.deleteMany({ where: { userId: otherUserId } });
      await prisma.user.deleteMany({ where: { id: otherUserId } });
    }
    await deleteTestUser();
  });

  it('allows the owner to GET their job', async () => {
    const response = createMockResponse();
    await controller.findById(
      { user: { id: ownerId }, params: { id: jobId } } as unknown as Request,
      response,
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        data: expect.objectContaining({
          job: expect.objectContaining({ id: jobId }),
        }),
      }),
    );
  });

  it('rejects GET and PUT from another tenant', async () => {
    const getRequest = {
      user: { id: otherUserId },
      params: { id: jobId },
    } as unknown as Request;
    await expect(controller.findById(getRequest, createMockResponse())).rejects.toMatchObject({
      statusCode: 403,
      code: 'NO_COMPANY_ACCESS',
    });
    const putRequest = {
      user: { id: otherUserId },
      params: { id: jobId },
      body: { quantity: 99 },
    } as unknown as Request;
    await expect(controller.update(putRequest, createMockResponse())).rejects.toMatchObject({
      statusCode: 403,
      code: 'NO_COMPANY_ACCESS',
    });
  });

  it('does not dump other tenants jobs in grouped listing', async () => {
    const { groups } = await new ListJobsGroupedByJobIdUseCase(jobRepository).execute({
      userId: otherUserId,
    });
    const jobIds = groups.flatMap((group) => group.jobs.map((job) => job.id));
    expect(jobIds).not.toContain(jobId);
  });
});
