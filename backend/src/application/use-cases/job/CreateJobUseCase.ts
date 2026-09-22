import { Job } from '../../../domain/entities/Job';
import { IJobRepository } from '../../../domain/repositories/IJobRepository';
import { IStockRepository } from '../../../domain/repositories/IStockRepository';
import { AppError } from '../../../domain/errors/AppError';
import { Stock } from '../../../domain/entities/Stock';
import { CreateStockProps } from '../../../domain/dtos/stock.dto';
import { JobCategory, Prisma } from '@prisma/client';

export interface CreateJobDTO {
  productionUnitId: string;
  productionCycleId?: string | null;
  dateOfOpeation: Date;
  category: JobCategory;
  quantity: number;
  unitOfMeasureQuantity: string;
  jobId?: string | null;
  productQuantityTreated?: number | null;
  unitOfMeasureProductQuantityTreated?: string | null;
  modeOfApplication?: string | null;
  avversity?: string | null;
  giustification?: string | null;
  treatedSurface?: number | null;
  isLocalizedTreatment?: boolean | null;
  userId?: string | null;
  note?: string | null;
  alertNotes?: Prisma.JsonValue | null;
  history?: Prisma.JsonValue | null;
  appliedRules?: Prisma.JsonValue | null;
  totalDistributedWaterL?: number | null;
  machineId?: string | null;
  conformityChecked?: boolean;
  stocks?: Array<CreateStockProps>;
}

export class CreateJobUseCase {
  constructor(
    private readonly jobRepository: IJobRepository,
    private readonly stockRepository: IStockRepository,
  ) {}

  async execute(data: CreateJobDTO): Promise<{ job: Job }> {
    if (
      !data.productionUnitId ||
      !data.dateOfOpeation ||
      !data.category ||
      typeof data.quantity !== 'number' ||
      !data.unitOfMeasureQuantity
    ) {
      throw AppError.badRequest('Missing required fields', 'MISSING_FIELDS');
    }

    const job = Job.create({
      productionUnitId: data.productionUnitId,
      productionCycleId: data.productionCycleId ?? null,
      jobId: data.jobId ?? null,
      dateOfOpeation: data.dateOfOpeation,
      isVerified: false,
      conformityChecked: data.conformityChecked ?? false,
      category: data.category,
      quantity: data.quantity,
      unitOfMeasureQuantity: data.unitOfMeasureQuantity,
      productQuantityTreated: data.productQuantityTreated ?? null,
      unitOfMeasureProductQuantityTreated: data.unitOfMeasureProductQuantityTreated ?? null,
      modeOfApplication: data.modeOfApplication ?? null,
      avversity: data.avversity ?? null,
      giustification: data.giustification ?? null,
      treatedSurface: data.treatedSurface ?? null,
      isLocalizedTreatment: data.isLocalizedTreatment ?? null,
      userId: data.userId ?? null,
      note: data.note ?? null,
      alertNotes: data.alertNotes ?? null,
      history: data.history ?? null,
      appliedRules: data.appliedRules ?? null,
      totalDistributedWaterL: data.totalDistributedWaterL ?? null,
      machineId: data.machineId ?? null,
    });

    const created = await this.jobRepository.create(job);

    if (data.stocks && data.stocks.length > 0) {
      const stockEntities = data.stocks.map((s) =>
        Stock.create({
          productId: s.productId,
          jobId: created.id,
          quantity: s.quantity,
          unitOfMeasureQuantity: s.unitOfMeasureQuantity,
          price: s.price ?? 0,
          unitOfMeasurePrice: s.unitOfMeasurePrice ?? '',
          type: s.type,
          ddtCode: s.ddtCode ?? null,
          ddtUrlFile: s.ddtUrlFile ?? null,
          invoiceCode: s.invoiceCode ?? null,
          invoiceUrlFile: s.invoiceUrlFile ?? null,
          companySupplierName: s.companySupplierName ?? null,
          addressSupplier: s.addressSupplier ?? null,
          vatNumberSupplier: s.vatNumberSupplier ?? null,
        }),
      );
      await this.stockRepository.createMany(stockEntities);
    }

    return { job: created };
  }
}
