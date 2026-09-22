import { CompanyAccessGuard } from '../../application/use-cases/access/CompanyAccessGuard';
import { ResourceAccessGuard } from '../../application/use-cases/access/ResourceAccessGuard';
import { File } from '../../domain/entities/File';
import { Job } from '../../domain/entities/Job';
import { Patentino } from '../../domain/entities/Patentino';
import { ProductionUnit } from '../../domain/entities/ProductionUnit';
import { Warehouse } from '../../domain/entities/Warehouse';
import { IFileRepository } from '../../domain/repositories/IFileRepository';
import { IJobRepository } from '../../domain/repositories/IJobRepository';
import { IPatentinoRepository } from '../../domain/repositories/IPatentinoRepository';
import { IProductionUnitRepository } from '../../domain/repositories/IProductionUnitRepository';
import { IUserOnCompanyRepository } from '../../domain/repositories/IUserOnCompanyRepository';
import { IWarehouseRepository } from '../../domain/repositories/IWarehouseRepository';
import { UserOnCompany } from '../../domain/entities/UserOnCompany';
import { CompanyRole, JobCategory } from '@prisma/client';

describe('ResourceAccessGuard', () => {
  it('allows a job in the caller company', async () => {
    const guard = createGuard({ companyIds: ['company-a'], jobCompanyIds: ['company-a'] });
    await expect(guard.assertJob('user-1', 'job-1')).resolves.toMatchObject({ id: 'job-1' });
  });

  it('returns 404 when the job is missing', async () => {
    const guard = createGuard({ companyIds: ['company-a'], job: null });
    await expect(guard.assertJob('user-1', 'missing')).rejects.toMatchObject({
      statusCode: 404,
      code: 'JOB_NOT_FOUND',
    });
  });

  it('rejects a job with no linked company', async () => {
    const guard = createGuard({ companyIds: ['company-a'], jobCompanyIds: [] });
    await expect(guard.assertJob('user-1', 'job-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'NO_COMPANY_ACCESS',
    });
  });

  it('rejects a job from another company', async () => {
    const guard = createGuard({ companyIds: ['company-a'], jobCompanyIds: ['company-b'] });
    await expect(guard.assertJob('user-1', 'job-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'NO_COMPANY_ACCESS',
    });
  });

  it('rejects a batch when one job is forbidden', async () => {
    const jobRepo = {
      findById: jest
        .fn()
        .mockResolvedValueOnce(createJob('job-1'))
        .mockResolvedValueOnce(createJob('job-2')),
    } as unknown as IJobRepository;
    const puRepo = {
      findById: async () => createProductionUnit(),
      listCompanyIdsByProductionUnit: jest
        .fn()
        .mockResolvedValueOnce(['company-a'])
        .mockResolvedValueOnce(['company-b']),
    } as unknown as IProductionUnitRepository;
    const guard = new ResourceAccessGuard(
      new CompanyAccessGuard(createMembershipRepo(['company-a'])),
      jobRepo,
      puRepo,
      {} as IWarehouseRepository,
      {} as IFileRepository,
      {} as IPatentinoRepository,
    );
    await expect(guard.assertJobs('user-1', ['job-1', 'job-2'])).rejects.toMatchObject({
      statusCode: 403,
      code: 'NO_COMPANY_ACCESS',
    });
  });

  it('rejects a warehouse from another company', async () => {
    const warehouse = createWarehouse('company-b');
    const guard = createGuard({
      companyIds: ['company-a'],
      warehouse,
    });
    await expect(guard.assertWarehouse('user-1', warehouse.id)).rejects.toMatchObject({
      statusCode: 403,
      code: 'NO_COMPANY_ACCESS',
    });
  });

  it('rejects a file from another company', async () => {
    const file = new File('file-1', 'doc.pdf', 'https://example.com', 'company-b');
    const guard = createGuard({ companyIds: ['company-a'], file });
    await expect(guard.assertFile('user-1', file.id)).rejects.toMatchObject({
      statusCode: 403,
      code: 'NO_COMPANY_ACCESS',
    });
  });

  it('allows the patentino owner and rejects another user', async () => {
    const patentino = createPatentino('user-1');
    const guard = createGuard({ companyIds: ['company-a'], patentino });
    await expect(guard.assertPatentino('user-1', patentino.id)).resolves.toBe(patentino);
    await expect(guard.assertPatentino('user-2', patentino.id)).rejects.toMatchObject({
      statusCode: 403,
      code: 'PATENTINO_ACCESS_DENIED',
    });
  });
});

function createGuard(input: {
  readonly companyIds: readonly string[];
  readonly job?: Job | null;
  readonly jobCompanyIds?: readonly string[];
  readonly warehouse?: Warehouse;
  readonly file?: File;
  readonly patentino?: Patentino;
}): ResourceAccessGuard {
  const job = input.job === undefined ? createJob('job-1') : input.job;
  return new ResourceAccessGuard(
    new CompanyAccessGuard(createMembershipRepo(input.companyIds)),
    {
      findById: async () => job,
    } as unknown as IJobRepository,
    {
      findById: async () => createProductionUnit(),
      listCompanyIdsByProductionUnit: async () => [...(input.jobCompanyIds ?? ['company-a'])],
    } as unknown as IProductionUnitRepository,
    {
      findById: async () => input.warehouse ?? null,
    } as unknown as IWarehouseRepository,
    {
      findById: async () => input.file ?? null,
    } as unknown as IFileRepository,
    {
      findById: async () => input.patentino ?? null,
    } as unknown as IPatentinoRepository,
  );
}

function createMembershipRepo(companyIds: readonly string[]): IUserOnCompanyRepository {
  const memberships = companyIds.map(
    (companyId) => new UserOnCompany('m1', companyId, 'user-1', null, CompanyRole.VIEWER),
  );
  return {
    create: async (row) => row,
    findById: async () => null,
    findByCompanyId: async () => [],
    findByCompanyIdWithDetails: async () => [],
    findByUserId: async () => memberships,
    findByUserIdWithDetails: async () => [],
    findByCompanyAndUser: async (companyId) =>
      memberships.find((membership) => membership.companyId === companyId) ?? null,
    update: async (_id, row) => row as UserOnCompany,
    delete: async () => undefined,
    deleteByCompanyAndUser: async () => undefined,
  };
}

function createJob(id: string): Job {
  return new Job(
    id,
    null,
    'pu-1',
    null,
    new Date('2026-01-01T00:00:00.000Z'),
    false,
    false,
    JobCategory.TREATMENT,
    1,
    'L',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    new Date(),
    new Date(),
  );
}

function createProductionUnit(): ProductionUnit {
  return new ProductionUnit(
    'pu-1',
    'cycle-1',
    'PU',
    'Crop',
    'CT',
    'V',
    'P',
    1,
    'N',
    new Date(),
    null,
    null,
    null,
    null,
    null,
    0,
    2026,
    1,
    new Date(),
    new Date(),
  );
}

function createWarehouse(companyId: string): Warehouse {
  const now = new Date();
  return new Warehouse(
    'w1',
    companyId,
    'Main',
    'Addr',
    null,
    null,
    null,
    null,
    'S',
    'F',
    'P',
    null,
    now,
    now,
  );
}

function createPatentino(userId: string): Patentino {
  return new Patentino(
    'p1',
    'A',
    'CODE-1',
    new Date(Date.now() + 86400000),
    new Date(),
    true,
    new Date(),
    new Date(),
    userId,
  );
}
