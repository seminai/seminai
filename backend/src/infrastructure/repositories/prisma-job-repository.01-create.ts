import { Prisma } from '@prisma/client';
import { Job } from '../../domain/entities/Job';
import type { PrismaJobRepositoryContext } from './prisma-job-repository.context';

export async function prismaJobRepositoryCreate(this: PrismaJobRepositoryContext, job: Job): Promise<Job> {
    const created = await this.prisma.job.create({
      data: {
        id: job.id,
        jobId: job.jobId ?? undefined,
        productionUnitId: job.productionUnitId,
        dateOfOpeation: job.dateOfOpeation,
        isVerified: job.isVerified,
        conformityChecked: job.conformityChecked,
        category: job.category,
        quantity: job.quantity,
        unitOfMeasureQuantity: job.unitOfMeasureQuantity,
        productQuantityTreated: job.productQuantityTreated ?? undefined,
        unitOfMeasureProductQuantityTreated: job.unitOfMeasureProductQuantityTreated ?? undefined,
        modeOfApplication: job.modeOfApplication ?? undefined,
        avversity: job.avversity ?? undefined,
        giustification: job.giustification ?? undefined,
        treatedSurface: job.treatedSurface ?? undefined,
        isLocalizedTreatment: job.isLocalizedTreatment ?? undefined,
        userId: job.userId ?? undefined,
        note: job.note ?? undefined,
        alertNotes:
          job.alertNotes === null ? Prisma.JsonNull : (job.alertNotes as Prisma.InputJsonValue),
        history: job.history === null ? Prisma.JsonNull : (job.history as Prisma.InputJsonValue),
        appliedRules:
          job.appliedRules === null ? Prisma.JsonNull : (job.appliedRules as Prisma.InputJsonValue),
        totalDistributedWaterL: job.totalDistributedWaterL ?? undefined,
        machineId: job.machineId ?? undefined,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
    });
    return Job.fromPrisma(created);
  }
