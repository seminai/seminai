import { randomUUID } from 'node:crypto';
import { Job as PrismaJob, JobCategory, Prisma } from '@prisma/client';

/**
 * Job domain entity representing an operation done on a production unit.
 */
export class Job {
  constructor(
    public readonly id: string,
    public readonly jobId: string | null,
    public readonly productionUnitId: string,
    public readonly productionCycleId: string | null,
    public readonly dateOfOpeation: Date,
    public readonly isVerified: boolean,
    public readonly conformityChecked: boolean,
    public readonly category: JobCategory,
    public readonly quantity: number,
    public readonly unitOfMeasureQuantity: string,
    public readonly productQuantityTreated: number | null,
    public readonly unitOfMeasureProductQuantityTreated: string | null,
    public readonly modeOfApplication: string | null,
    public readonly avversity: string | null,
    public readonly giustification: string | null,
    public readonly treatedSurface: number | null,
    public readonly isLocalizedTreatment: boolean | null,
    public readonly userId: string | null,
    public readonly note: string | null,
    public readonly alertNotes: Prisma.JsonValue | null,
    public readonly history: Prisma.JsonValue | null,
    public readonly appliedRules: Prisma.JsonValue | null,
    public readonly totalDistributedWaterL: number | null,
    public readonly machineId: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  /**
   * Factory to create a new Job with generated id and timestamps.
   */
  static create(props: Omit<PrismaJob, 'id' | 'createdAt' | 'updatedAt'>): Job {
    return new Job(
      randomUUID(),
      props.jobId ?? null,
      props.productionUnitId,
      props.productionCycleId ?? null,
      props.dateOfOpeation,
      props.isVerified ?? false,
      props.conformityChecked ?? false,
      props.category,
      props.quantity,
      props.unitOfMeasureQuantity,
      props.productQuantityTreated ?? null,
      props.unitOfMeasureProductQuantityTreated ?? null,
      props.modeOfApplication ?? null,
      props.avversity ?? null,
      props.giustification ?? null,
      props.treatedSurface ?? null,
      props.isLocalizedTreatment ?? null,
      props.userId ?? null,
      props.note ?? null,
      props.alertNotes ?? null,
      props.history ?? null,
      props.appliedRules ?? null,
      props.totalDistributedWaterL ?? null,
      props.machineId ?? null,
      new Date(),
      new Date(),
    );
  }

  /**
   * Build a Job from Prisma record.
   */
  static fromPrisma(prismaJob: PrismaJob): Job {
    return new Job(
      prismaJob.id,
      prismaJob.jobId ?? null,
      prismaJob.productionUnitId,
      prismaJob.productionCycleId ?? null,
      prismaJob.dateOfOpeation,
      prismaJob.isVerified,
      prismaJob.conformityChecked,
      prismaJob.category,
      prismaJob.quantity,
      prismaJob.unitOfMeasureQuantity,
      prismaJob.productQuantityTreated,
      prismaJob.unitOfMeasureProductQuantityTreated,
      prismaJob.modeOfApplication,
      prismaJob.avversity,
      prismaJob.giustification,
      prismaJob.treatedSurface,
      prismaJob.isLocalizedTreatment,
      prismaJob.userId,
      prismaJob.note,
      prismaJob.alertNotes ?? null,
      prismaJob.history ?? null,
      prismaJob.appliedRules ?? null,
      prismaJob.totalDistributedWaterL,
      prismaJob.machineId,
      prismaJob.createdAt,
      prismaJob.updatedAt,
    );
  }
}
