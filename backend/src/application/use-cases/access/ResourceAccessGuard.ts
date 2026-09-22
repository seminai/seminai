import { AppError } from '../../../domain/errors/AppError';
import { File } from '../../../domain/entities/File';
import { Job } from '../../../domain/entities/Job';
import { Patentino } from '../../../domain/entities/Patentino';
import { ProductionUnit } from '../../../domain/entities/ProductionUnit';
import { Warehouse } from '../../../domain/entities/Warehouse';
import { IFileRepository } from '../../../domain/repositories/IFileRepository';
import { IJobRepository } from '../../../domain/repositories/IJobRepository';
import { IPatentinoRepository } from '../../../domain/repositories/IPatentinoRepository';
import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import { IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';
import { CompanyAccessGuard } from './CompanyAccessGuard';

/**
 * Loads a resource by id and asserts the caller can access its tenant (or owner).
 */
export class ResourceAccessGuard {
  constructor(
    private readonly companyAccess: CompanyAccessGuard,
    private readonly jobRepository: IJobRepository,
    private readonly productionUnitRepository: IProductionUnitRepository,
    private readonly warehouseRepository: IWarehouseRepository,
    private readonly fileRepository: IFileRepository,
    private readonly patentinoRepository: IPatentinoRepository,
  ) {}

  async assertMember(userId: string, companyId: string | null | undefined): Promise<void> {
    await this.companyAccess.assertMember(userId, companyId);
  }

  async assertJob(userId: string, jobId: string): Promise<Job> {
    const job = await this.jobRepository.findById(jobId);
    if (!job) {
      throw AppError.notFound('Job not found', 'JOB_NOT_FOUND');
    }
    const companyIds = await this.productionUnitRepository.listCompanyIdsByProductionUnit(
      job.productionUnitId,
    );
    await this.companyAccess.assertMemberOfAny(userId, companyIds);
    return job;
  }

  async assertJobs(userId: string, jobIds: readonly string[]): Promise<void> {
    const uniqueIds = [...new Set(jobIds.filter((id) => id.length > 0))];
    for (const jobId of uniqueIds) {
      await this.assertJob(userId, jobId);
    }
  }

  async assertProductionUnit(userId: string, productionUnitId: string): Promise<ProductionUnit> {
    const productionUnit = await this.productionUnitRepository.findById(productionUnitId);
    if (!productionUnit) {
      throw AppError.notFound('ProductionUnit not found', 'PRODUCTION_UNIT_NOT_FOUND');
    }
    const companyIds =
      await this.productionUnitRepository.listCompanyIdsByProductionUnit(productionUnitId);
    await this.companyAccess.assertMemberOfAny(userId, companyIds);
    return productionUnit;
  }

  async assertProductionUnits(userId: string, productionUnitIds: readonly string[]): Promise<void> {
    const uniqueIds = [...new Set(productionUnitIds.filter((id) => id.length > 0))];
    for (const productionUnitId of uniqueIds) {
      await this.assertProductionUnit(userId, productionUnitId);
    }
  }

  async assertWarehouse(userId: string, warehouseId: string): Promise<Warehouse> {
    const warehouse = await this.warehouseRepository.findById(warehouseId);
    if (!warehouse) {
      throw AppError.notFound('Warehouse not found', 'WAREHOUSE_NOT_FOUND');
    }
    await this.companyAccess.assertMember(userId, warehouse.companyId);
    return warehouse;
  }

  async assertFile(userId: string, fileId: string): Promise<File> {
    const file = await this.fileRepository.findById(fileId);
    if (!file) {
      throw AppError.notFound('File not found', 'FILE_NOT_FOUND');
    }
    await this.companyAccess.assertMember(userId, file.companyId);
    return file;
  }

  async assertPatentino(userId: string, patentinoId: string): Promise<Patentino> {
    const patentino = await this.patentinoRepository.findById(patentinoId);
    if (!patentino) {
      throw AppError.notFound('Patentino not found', 'PATENTINO_NOT_FOUND');
    }
    if (patentino.userId !== userId) {
      throw AppError.forbidden('Access denied to this patentino', 'PATENTINO_ACCESS_DENIED');
    }
    return patentino;
  }
}
