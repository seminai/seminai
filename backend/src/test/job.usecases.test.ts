import { IJobRepository } from '../domain/repositories/IJobRepository';
import { IStockRepository } from '../domain/repositories/IStockRepository';
import { CreateJobUseCase } from '../application/use-cases/job/CreateJobUseCase';
import { UpdateJobUseCase } from '../application/use-cases/job/UpdateJobUseCase';
import { AssignUserToJobUseCase } from '../application/use-cases/job/AssignUserToJobUseCase';
import { IUserRepository } from '../domain/repositories/IUserRepository';
import { IProductionUnitRepository } from '../domain/repositories/IProductionUnitRepository';
import { IFieldRepository } from '../domain/repositories/IFieldRepository';
import { IUserOnCompanyRepository } from '../domain/repositories/IUserOnCompanyRepository';
import { AppError } from '../domain/errors/AppError';
import { Job, JobCategory } from '@prisma/client';

describe('Job UseCases', () => {
  let jobRepo: jest.Mocked<IJobRepository>;
  let stockRepo: jest.Mocked<IStockRepository>;

  beforeEach(() => {
    jobRepo = {
      create: jest.fn(),
      createMany: jest.fn(),
      findById: jest.fn(),
      findManyByProductionUnitId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IJobRepository>;

    stockRepo = {
      create: jest.fn(),
      createMany: jest.fn(),
      deleteByJobId: jest.fn(),
    } as unknown as jest.Mocked<IStockRepository>;
  });

  it('CreateJobUseCase creates job and attached stocks', async () => {
    jobRepo.create.mockImplementation(async (j) => j);
    const useCase = new CreateJobUseCase(jobRepo, stockRepo);
    const result = await useCase.execute({
      productionUnitId: 'pu1',
      dateOfOpeation: new Date(),
      category: JobCategory.TREATMENT,
      quantity: 1,
      unitOfMeasureQuantity: 'L',
      stocks: [
        {
          productId: 'p1',
          quantity: -1,
          unitOfMeasureQuantity: 'L',
          price: 0,
          unitOfMeasurePrice: 'EUR',
          type: 'OUT',
        },
      ],
    });
    expect(result.job).toBeDefined();
    expect(stockRepo.createMany).toHaveBeenCalled();
  });

  it('UpdateJobUseCase replaces stocks when provided', async () => {
    jobRepo.findById.mockResolvedValue({ id: 'j1' } as Job);
    jobRepo.update.mockResolvedValue({ id: 'j1', quantity: 2 } as Job);
    const useCase = new UpdateJobUseCase(jobRepo, stockRepo);
    const result = await useCase.execute({ id: 'j1', data: { quantity: 2, stocks: [] } });
    expect(stockRepo.deleteByJobId).toHaveBeenCalledWith('j1');
    expect(result.job.quantity).toBe(2);
  });
});

describe('AssignUserToJobUseCase', () => {
  let jobRepo: jest.Mocked<IJobRepository>;
  let userRepo: jest.Mocked<IUserRepository>;
  let puRepo: jest.Mocked<IProductionUnitRepository>;
  let fieldRepo: jest.Mocked<IFieldRepository>;
  let uocRepo: jest.Mocked<IUserOnCompanyRepository>;

  beforeEach(() => {
    jobRepo = {
      create: jest.fn(),
      createMany: jest.fn(),
      findById: jest.fn(),
      findManyByProductionUnitId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IJobRepository>;
    userRepo = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IUserRepository>;
    puRepo = {
      create: jest.fn(),
      createMany: jest.fn(),
      findById: jest.fn(),
      findManyByFieldId: jest.fn(),
      sumAreaByFieldAndOverlappingRange: jest.fn(),
      listFieldIdsByProductionUnit: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IProductionUnitRepository>;
    fieldRepo = {
      create: jest.fn(),
      createMany: jest.fn(),
      findById: jest.fn(),
      findManyByCompanyId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IFieldRepository>;
    uocRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByCompanyId: jest.fn(),
      findByUserId: jest.fn(),
      findByCompanyAndUser: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteByCompanyAndUser: jest.fn(),
    } as unknown as jest.Mocked<IUserOnCompanyRepository>;
  });

  it('assigns user when membership is valid', async () => {
    jobRepo.findById.mockResolvedValue({ id: 'j1', productionUnitId: 'pu1' } as Job);
    userRepo.findById.mockResolvedValue({ id: 'u1' } as never);
    puRepo.findById.mockResolvedValue({ id: 'pu1' } as never);
    puRepo.listFieldIdsByProductionUnit.mockResolvedValue(['f1']);
    fieldRepo.findById.mockResolvedValue({ id: 'f1', companyId: 'c1' } as never);
    uocRepo.findByCompanyAndUser.mockResolvedValue({ id: 'uoc1' } as never);
    jobRepo.update.mockResolvedValue({ id: 'j1', userId: 'u1' } as Job);

    const useCase = new AssignUserToJobUseCase(jobRepo, userRepo, puRepo, fieldRepo, uocRepo);
    const result = await useCase.execute({ jobId: 'j1', userId: 'u1' });
    expect(result.job.userId).toBe('u1');
  });

  it('throws when user not in company', async () => {
    jobRepo.findById.mockResolvedValue({ id: 'j1', productionUnitId: 'pu1' } as Job);
    userRepo.findById.mockResolvedValue({ id: 'u1' } as never);
    puRepo.findById.mockResolvedValue({ id: 'pu1' } as never);
    puRepo.listFieldIdsByProductionUnit.mockResolvedValue(['f1']);
    fieldRepo.findById.mockResolvedValue({ id: 'f1', companyId: 'c1' } as never);
    uocRepo.findByCompanyAndUser.mockResolvedValue(null);

    const useCase = new AssignUserToJobUseCase(jobRepo, userRepo, puRepo, fieldRepo, uocRepo);
    await expect(useCase.execute({ jobId: 'j1', userId: 'u1' })).rejects.toThrow(AppError);
  });
});
