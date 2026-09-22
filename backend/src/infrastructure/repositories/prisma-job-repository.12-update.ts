import { JobCategory, Prisma } from '@prisma/client';
import { Job } from '../../domain/entities/Job';
import type { PrismaJobRepositoryContext } from './prisma-job-repository.context';

export async function prismaJobRepositoryUpdate(this: PrismaJobRepositoryContext, id: string, data: Partial<Job>): Promise<Job> {
    const prismaData: Prisma.JobUpdateInput = {};
    if (typeof data.productionUnitId !== 'undefined')
      prismaData.productionUnit = { connect: { id: data.productionUnitId } };
    if (typeof data.dateOfOpeation !== 'undefined')
      prismaData.dateOfOpeation = data.dateOfOpeation as Date;
    if (typeof data.isVerified !== 'undefined') prismaData.isVerified = data.isVerified as boolean;
    if (typeof data.conformityChecked !== 'undefined')
      prismaData.conformityChecked = data.conformityChecked as boolean;
    if (typeof data.category !== 'undefined') prismaData.category = data.category as JobCategory;
    if (typeof data.quantity !== 'undefined') prismaData.quantity = data.quantity as number;
    if (typeof data.unitOfMeasureQuantity !== 'undefined')
      prismaData.unitOfMeasureQuantity = data.unitOfMeasureQuantity as string;
    if (typeof data.productQuantityTreated !== 'undefined')
      prismaData.productQuantityTreated = data.productQuantityTreated as number | null;
    if (typeof data.unitOfMeasureProductQuantityTreated !== 'undefined')
      prismaData.unitOfMeasureProductQuantityTreated = data.unitOfMeasureProductQuantityTreated as
        | string
        | null;
    if (typeof data.modeOfApplication !== 'undefined')
      prismaData.modeOfApplication = data.modeOfApplication as string | null;
    if (typeof data.avversity !== 'undefined')
      prismaData.avversity = data.avversity as string | null;
    if (typeof data.giustification !== 'undefined')
      prismaData.giustification = data.giustification as string | null;
    if (typeof data.treatedSurface !== 'undefined')
      prismaData.treatedSurface = data.treatedSurface as number | null;
    if (typeof data.isLocalizedTreatment !== 'undefined')
      prismaData.isLocalizedTreatment = data.isLocalizedTreatment as boolean | null;
    if (typeof data.userId !== 'undefined')
      prismaData.user = data.userId ? { connect: { id: data.userId } } : { disconnect: true };
    if (typeof data.note !== 'undefined') prismaData.note = data.note as string | null;
    if (typeof data.alertNotes !== 'undefined') {
      prismaData.alertNotes =
        data.alertNotes === null ? Prisma.JsonNull : (data.alertNotes as Prisma.InputJsonValue);
    }
    if (typeof data.history !== 'undefined') {
      prismaData.history =
        data.history === null ? Prisma.JsonNull : (data.history as Prisma.InputJsonValue);
    }
    if (typeof data.appliedRules !== 'undefined') {
      prismaData.appliedRules =
        data.appliedRules === null ? Prisma.JsonNull : (data.appliedRules as Prisma.InputJsonValue);
    }
    if (typeof data.totalDistributedWaterL !== 'undefined')
      prismaData.totalDistributedWaterL = data.totalDistributedWaterL as number | null;
    if (typeof data.machineId !== 'undefined')
      prismaData.machine = data.machineId
        ? { connect: { id: data.machineId } }
        : { disconnect: true };
    if (typeof data.jobId !== 'undefined') {
      prismaData.jobId = data.jobId as string | null;
    }

    const updated = await this.prisma.job.update({ where: { id }, data: prismaData });
    return Job.fromPrisma(updated);
  }
