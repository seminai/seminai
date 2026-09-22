import { type ICompanyRepository } from '../domain/repositories/ICompanyRepository';
import {
  type IFileExtractionRepository,
  type ListFileExtractionRecordsInput,
} from '../domain/repositories/IFileExtractionRepository';
import { type IJobRepository } from '../domain/repositories/IJobRepository';
import { ListFileExtractionsUseCase } from '../application/use-cases/extraction/ListFileExtractionsUseCase';

describe('ListFileExtractionsUseCase', () => {
  let extractionRepository: jest.Mocked<IFileExtractionRepository>;
  let companyRepository: jest.Mocked<ICompanyRepository>;
  let jobRepository: jest.Mocked<IJobRepository>;

  beforeEach(() => {
    extractionRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByBatchId: jest.fn(),
      findByCompanyId: jest.fn(),
      findManyForList: jest.fn(),
      findCategorySummaryByCompanyIds: jest.fn(),
      update: jest.fn(),
      deleteById: jest.fn(),
    } as unknown as jest.Mocked<IFileExtractionRepository>;

    companyRepository = {
      create: jest.fn(),
      createMany: jest.fn(),
      findById: jest.fn(),
      findManyByUserId: jest.fn(),
      findByVatNumber: jest.fn(),
      findByFiscalCode: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteWithAllData: jest.fn(),
    } as unknown as jest.Mocked<ICompanyRepository>;
    jobRepository = {
      create: jest.fn(),
      createMany: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      findManyByProductionUnitId: jest.fn(),
      findManyByUserIdWithAssignment: jest.fn(),
      findManyByUserIdWithAssignmentWithoutHistory: jest.fn(),
      findVerifiedJobsByUserIdWithAssignment: jest.fn(),
      findUnverifiedJobsByUserIdWithAssignment: jest.fn(),
      findManyByIdsWithProducts: jest.fn(),
      findJobGroupsSummaryByUserId: jest.fn(),
      findManyByIdsWithCompany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    } as unknown as jest.Mocked<IJobRepository>;
  });

  it('returns paginated extractions for an allowed company', async () => {
    companyRepository.findManyByUserId.mockResolvedValue([
      { id: 'company-1', name: 'Alpha Farm' },
    ] as never);

    extractionRepository.findManyForList.mockResolvedValue({
      records: [
        {
          id: 'ext-1',
          batchId: 'batch-1',
          status: 'PENDING_CONFIRMATION',
          category: 'invoice',
          progress: 90,
          extractedData: null,
          error: null,
          fileName: 'invoice.pdf',
          fileIndex: 0,
          fileId: null,
          fileUrl: null,
          companyId: 'company-1',
          userId: 'user-1',
          createdAt: new Date('2026-01-10T12:00:00.000Z'),
          updatedAt: new Date('2026-01-11T12:00:00.000Z'),
        },
      ],
      total: 1,
    });

    const useCase = new ListFileExtractionsUseCase(
      extractionRepository,
      companyRepository,
      jobRepository,
    );
    const result = await useCase.execute({
      userId: 'user-1',
      query: {
        companyId: 'company-1',
        page: 1,
        pageSize: 25,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      },
    });

    const firstCallInput = extractionRepository.findManyForList.mock
      .calls[0][0] as ListFileExtractionRecordsInput;
    expect(firstCallInput.allowedCompanyIds).toEqual(['company-1']);
    expect(result.total).toBe(1);
    expect(result.extractions[0].id).toBe('ext-1');
  });

  it('throws forbidden when company is not in user scope', async () => {
    companyRepository.findManyByUserId.mockResolvedValue([{ id: 'company-1' }] as never);

    const useCase = new ListFileExtractionsUseCase(
      extractionRepository,
      companyRepository,
      jobRepository,
    );
    await expect(
      useCase.execute({
        userId: 'user-1',
        query: {
          companyId: 'company-2',
          page: 1,
          pageSize: 25,
          sortBy: 'updatedAt',
          sortOrder: 'desc',
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'COMPANY_ACCESS_DENIED',
    });
  });
});
