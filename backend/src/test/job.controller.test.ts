import { Request, Response } from 'express';
import { JobCategory } from '@prisma/client';
import { JobController } from '../infrastructure/http/controllers/JobController';
import { BulkCreateProductAndJobUseCase } from '../application/use-cases/job/BulkCreateProductAndJobUseCase';
import { IJobRepository } from '../domain/repositories/IJobRepository';
import { IStockRepository } from '../domain/repositories/IStockRepository';
import { IUserRepository } from '../domain/repositories/IUserRepository';
import { IProductionUnitRepository } from '../domain/repositories/IProductionUnitRepository';
import { IFieldRepository } from '../domain/repositories/IFieldRepository';
import { IUserOnCompanyRepository } from '../domain/repositories/IUserOnCompanyRepository';
import { IProductRepository } from '../domain/repositories/IProductRepository';
import { IWarehouseRepository } from '../domain/repositories/IWarehouseRepository';
import { ResourceAccessGuard } from '../application/use-cases/access/ResourceAccessGuard';
import { AppError } from '../domain/errors/AppError';

describe('JobController', () => {
  it('should return explicit job-product links in bulk response', async () => {
    const mockJobRepository = {
      create: jest.fn(),
      createMany: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      findManyByProductionUnitId: jest.fn(),
      findManyByUserIdWithAssignment: jest.fn(),
      findManyByUserIdWithAssignmentWithoutHistory: jest.fn(),
      findVerifiedJobsByUserIdWithAssignment: jest.fn(),
      findUnverifiedJobsByUserIdWithAssignment: jest.fn(),
      findManyByIdsWithProducts: jest.fn().mockResolvedValue([
        {
          jobId: 'job-1',
          stockCount: 1,
          products: [{ id: 'prod-1', name: 'INEX', registrationNumber: null }],
        },
      ]),
      findJobGroupsSummaryByUserId: jest.fn(),
      findManyByIdsWithCompany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    } as unknown as jest.Mocked<IJobRepository>;
    const mockStockRepository = {} as IStockRepository;
    const mockAccess = {
      assertProductionUnits: jest.fn().mockResolvedValue(undefined),
      assertJob: jest.fn(),
    } as unknown as jest.Mocked<ResourceAccessGuard>;
    const mockUserRepository = {} as IUserRepository;
    const mockProductionUnitRepository = {} as IProductionUnitRepository;
    const mockFieldRepository = {} as IFieldRepository;
    const mockUserOnCompanyRepository = {} as IUserOnCompanyRepository;
    const mockProductRepository = {} as IProductRepository;
    const mockWarehouseRepository = {} as IWarehouseRepository;
    const controller = new JobController(
      mockJobRepository,
      mockStockRepository,
      mockAccess,
      mockUserRepository,
      mockProductionUnitRepository,
      mockFieldRepository,
      mockUserOnCompanyRepository,
      mockProductRepository,
      mockWarehouseRepository,
    );
    const createdJob = {
      id: 'job-1',
      jobId: '709662',
      productionUnitId: 'pu-1',
      productionCycleId: null,
      dateOfOpeation: new Date('2026-06-16T00:00:00.000Z'),
      isVerified: false,
      conformityChecked: false,
      category: JobCategory.TREATMENT,
      quantity: 1,
      unitOfMeasureQuantity: 'L',
      productQuantityTreated: null,
      unitOfMeasureProductQuantityTreated: null,
      modeOfApplication: null,
      avversity: null,
      giustification: null,
      treatedSurface: 1,
      isLocalizedTreatment: null,
      userId: null,
      note: null,
      alertNotes: null,
      history: null,
      appliedRules: null,
      totalDistributedWaterL: null,
      machineId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    jest
      .spyOn(BulkCreateProductAndJobUseCase.prototype, 'execute')
      .mockResolvedValue({ jobs: [createdJob] });
    const request = {
      user: { id: 'user-1' },
      body: [
        {
          productionUnitId: 'pu-1',
          dateOfOpeation: '2026-06-16T00:00:00.000Z',
          category: 'TREATMENT',
          quantity: 1,
          unitOfMeasureQuantity: 'L',
          stocks: [
            {
              product: { name: 'INEX', category: 'PESTICIDE', type: 'Fitosanitario' },
              quantity: -1,
              unitOfMeasureQuantity: 'L',
              type: 'OUT',
            },
          ],
        },
      ],
    } as unknown as Request;
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;
    await controller.bulkCreateProductAndJob(request, response);
    expect(mockAccess.assertProductionUnits).toHaveBeenCalledWith('user-1', ['pu-1']);
    expect(mockJobRepository.findManyByIdsWithProducts).toHaveBeenCalledWith(['job-1']);
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith({
      status: 'success',
      data: {
        jobs: [createdJob],
        jobProductLinks: [
          {
            jobId: 'job-1',
            stockCount: 1,
            products: [{ id: 'prod-1', name: 'INEX', registrationNumber: null }],
          },
        ],
      },
    });
  });

  it('rejects findById when the caller cannot access the job', async () => {
    const mockAccess = {
      assertJob: jest
        .fn()
        .mockRejectedValue(AppError.forbidden('No access to this company', 'NO_COMPANY_ACCESS')),
    } as unknown as jest.Mocked<ResourceAccessGuard>;
    const controller = new JobController({} as IJobRepository, {} as IStockRepository, mockAccess);
    const request = { user: { id: 'user-2' }, params: { id: 'job-1' } } as unknown as Request;
    const response = { json: jest.fn() } as unknown as Response;
    await expect(controller.findById(request, response)).rejects.toMatchObject({
      statusCode: 403,
      code: 'NO_COMPANY_ACCESS',
    });
  });
});
