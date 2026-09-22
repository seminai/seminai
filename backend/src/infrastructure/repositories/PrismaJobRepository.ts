import { JobCategory, Prisma, PrismaClient } from '@prisma/client';
import { Job } from '../../domain/entities/Job';
import {
  JobWithAssignmentDTO,
  JobWithAssignmentWithoutHistoryDTO,
  JobWithoutHistory,
} from '../../domain/dtos/job-assignment.dto';
import { JobGroupSummaryDTO } from '../../domain/dtos/job-group-summary.dto';
import { JobProductLinkDTO } from '../../domain/dtos/job-product-link.dto';
import { IJobRepository } from '../../domain/repositories/IJobRepository';

export class PrismaJobRepository implements IJobRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(job: Job): Promise<Job> {
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

  async createMany(jobs: Job[]): Promise<void> {
    if (jobs.length === 0) return;
    await this.prisma.job.createMany({
      data: jobs.map((job) => ({
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
      })),
    });
  }

  async findById(id: string): Promise<Job | null> {
    const found = await this.prisma.job.findUnique({ where: { id } });
    return found ? Job.fromPrisma(found) : null;
  }

  async findAll(): Promise<Job[]> {
    const list = await this.prisma.job.findMany();
    return list.map(Job.fromPrisma);
  }

  async findManyByProductionUnitId(productionUnitId: string): Promise<Job[]> {
    const list = await this.prisma.job.findMany({ where: { productionUnitId } });
    return list.map(Job.fromPrisma);
  }

  async findManyByUserIdWithAssignment(
    userId: string,
    companyName?: string,
    jobId?: string,
  ): Promise<JobWithAssignmentDTO[]> {
    const memberships = await this.prisma.userOnCompany.findMany({
      where: { userId },
      select: { companyId: true },
    });
    const companyIds = memberships.map((membership) => membership.companyId);
    if (companyIds.length === 0) {
      return [];
    }

    const fieldWhere: Prisma.FieldWhereInput = {
      companyId: { in: companyIds },
    };

    if (companyName) {
      fieldWhere.company = {
        name: {
          contains: companyName,
          mode: 'insensitive',
        },
      };
    }

    const prismaJobs = await this.prisma.job.findMany({
      where: {
        jobId: jobId || undefined,
        productionUnit: {
          productionUnitsOnFields: {
            some: {
              field: fieldWhere,
            },
          },
        },
      },
      include: {
        productionUnit: {
          select: {
            id: true,
            name: true,
            areaHa: true,
            cycles: {
              orderBy: [{ seasonYear: 'desc' }, { cycleIndex: 'desc' }, { harvestingDate: 'desc' }],
              take: 1,
              select: {
                cropName: true,
                cropType: true,
              },
            },
            productionUnitsOnFields: {
              select: {
                field: {
                  select: {
                    id: true,
                    name: true,
                    companyId: true,
                    company: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        stocks: {
          select: {
            product: {
              select: {
                id: true,
                name: true,
                registrationNumber: true,
              },
            },
          },
        },
        machine: {
          select: {
            id: true,
            name: true,
            identifier: true,
            lastPositiveRevisionDate: true,
          },
        },
      },
      orderBy: { dateOfOpeation: 'desc' },
    });

    const uniqueJobIds = [
      ...new Set(prismaJobs.map((job) => job.jobId).filter((id): id is string => id !== null)),
    ];

    const dosageAgentJobsMap = new Map<string, string | null>();
    if (uniqueJobIds.length > 0) {
      const dosageAgentJobs = await this.prisma.dosageAgentJob.findMany({
        where: { id: { in: uniqueJobIds } },
        select: { id: true, name: true },
      });
      for (const daj of dosageAgentJobs) {
        dosageAgentJobsMap.set(daj.id, daj.name);
      }
    }

    return prismaJobs
      .map((prismaJob) => {
        const productionUnit = prismaJob.productionUnit;
        if (!productionUnit) {
          return null;
        }
        const cycle = productionUnit.cycles[0];
        if (!cycle) {
          return null;
        }

        const products = Array.from(
          prismaJob.stocks
            .map((stock) => stock.product)
            .filter(
              (
                product,
              ): product is {
                id: string;
                name: string;
                registrationNumber: string | null;
              } => Boolean(product),
            )
            .reduce(
              (acc, product) =>
                acc.has(product.id)
                  ? acc
                  : acc.set(product.id, {
                      id: product.id,
                      name: product.name,
                      registrationNumber: product.registrationNumber ?? null,
                    }),
              new Map<
                string,
                {
                  readonly id: string;
                  readonly name: string;
                  readonly registrationNumber: string | null;
                }
              >(),
            )
            .values(),
        );

        const fieldsWithCompany = productionUnit.productionUnitsOnFields
          .map((relation) => relation.field)
          .filter(
            (
              field,
            ): field is {
              id: string;
              name: string;
              companyId: string;
              company: { id: string; name: string } | null;
            } => Boolean(field && field.companyId && field.company),
          )
          .filter((field) => companyIds.includes(field.companyId));

        if (fieldsWithCompany.length === 0) {
          return null;
        }

        const uniqueFields = Array.from(
          fieldsWithCompany
            .reduce(
              (acc, field) =>
                acc.has(field.id)
                  ? acc
                  : acc.set(field.id, {
                      id: field.id,
                      name: field.name,
                      companyId: field.companyId,
                      companyName: field.company?.name ?? '',
                      companyRecordId: field.company?.id ?? field.companyId,
                    }),
              new Map<
                string,
                {
                  id: string;
                  name: string;
                  companyId: string;
                  companyName: string;
                  companyRecordId: string;
                }
              >(),
            )
            .values(),
        );

        if (uniqueFields.length === 0) {
          return null;
        }

        const [primaryField] = uniqueFields;
        if (!primaryField) {
          return null;
        }

        const dosageAgentJobName = prismaJob.jobId
          ? dosageAgentJobsMap.get(prismaJob.jobId) ?? null
          : null;

        const machine = prismaJob.machine
          ? {
              id: prismaJob.machine.id,
              name: prismaJob.machine.name,
              identifier: prismaJob.machine.identifier,
              lastPositiveRevisionDate: prismaJob.machine.lastPositiveRevisionDate,
            }
          : null;

        return {
          job: Job.fromPrisma(prismaJob),
          productionUnit: {
            id: productionUnit.id,
            name: productionUnit.name,
            cropName: cycle.cropName,
            cropType: cycle.cropType,
            sauHa: productionUnit.areaHa,
          },
          products,
          fields: uniqueFields.map((field) => ({
            id: field.id,
            name: field.name,
          })) as ReadonlyArray<{ readonly id: string; readonly name: string }>,
          company: {
            id: primaryField.companyRecordId,
            name: primaryField.companyName,
          },
          machine,
          dosageAgentJobName,
        } as JobWithAssignmentDTO;
      })
      .filter((item): item is JobWithAssignmentDTO => item !== null);
  }

  async findManyByUserIdWithAssignmentWithoutHistory(
    userId: string,
    companyName?: string,
    jobId?: string,
  ): Promise<JobWithAssignmentWithoutHistoryDTO[]> {
    const jobs = await this.findManyByUserIdWithAssignment(userId, companyName, jobId);
    return jobs.map((item) => ({
      ...item,
      job: this.removeHistoryFromJob(item.job),
    }));
  }

  async findUnverifiedJobsByUserIdWithAssignment(
    userId: string,
    companyName?: string,
    jobGroupId?: string,
  ): Promise<JobWithAssignmentWithoutHistoryDTO[]> {
    const jobs = await this.findManyByUserIdWithAssignmentWithoutHistory(
      userId,
      companyName,
      jobGroupId,
    );
    return jobs.filter((item) => item.job.jobId !== null && !item.job.isVerified);
  }

  async findVerifiedJobsByUserIdWithAssignment(
    userId: string,
    companyName?: string,
    skip?: number,
    take?: number,
  ): Promise<{ jobs: JobWithAssignmentDTO[]; total: number }> {
    const memberships = await this.prisma.userOnCompany.findMany({
      where: { userId },
      select: { companyId: true },
    });
    const companyIds = memberships.map((membership) => membership.companyId);
    if (companyIds.length === 0) {
      return { jobs: [], total: 0 };
    }
    const fieldWhere: Prisma.FieldWhereInput = {
      companyId: { in: companyIds },
    };
    if (companyName) {
      fieldWhere.company = {
        name: {
          contains: companyName,
          mode: 'insensitive',
        },
      };
    }
    const whereClause: Prisma.JobWhereInput = {
      isVerified: true,
      conformityChecked: true,
      productionUnit: {
        productionUnitsOnFields: {
          some: {
            field: fieldWhere,
          },
        },
      },
    };
    const [prismaJobs, total] = await Promise.all([
      this.prisma.job.findMany({
        where: whereClause,
        skip,
        take,
        include: {
          productionUnit: {
            select: {
              id: true,
              name: true,
              areaHa: true,
              cycles: {
                orderBy: [
                  { seasonYear: 'desc' },
                  { cycleIndex: 'desc' },
                  { harvestingDate: 'desc' },
                ],
                take: 1,
                select: {
                  cropName: true,
                  cropType: true,
                },
              },
              productionUnitsOnFields: {
                select: {
                  field: {
                    select: {
                      id: true,
                      name: true,
                      companyId: true,
                      company: {
                        select: {
                          id: true,
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          stocks: {
            select: {
              product: {
                select: {
                  id: true,
                  name: true,
                  registrationNumber: true,
                },
              },
            },
          },
          machine: {
            select: {
              id: true,
              name: true,
              identifier: true,
              lastPositiveRevisionDate: true,
            },
          },
        },
        orderBy: { dateOfOpeation: 'desc' },
      }),
      this.prisma.job.count({ where: whereClause }),
    ]);
    const uniqueJobIds = [
      ...new Set(prismaJobs.map((job) => job.jobId).filter((id): id is string => id !== null)),
    ];
    const dosageAgentJobsMap = new Map<string, string | null>();
    if (uniqueJobIds.length > 0) {
      const dosageAgentJobs = await this.prisma.dosageAgentJob.findMany({
        where: { id: { in: uniqueJobIds } },
        select: { id: true, name: true },
      });
      for (const daj of dosageAgentJobs) {
        dosageAgentJobsMap.set(daj.id, daj.name);
      }
    }
    const jobs = prismaJobs
      .map((prismaJob) => {
        const productionUnit = prismaJob.productionUnit;
        if (!productionUnit) {
          return null;
        }
        const cycle = productionUnit.cycles[0];
        if (!cycle) {
          return null;
        }
        const products = Array.from(
          prismaJob.stocks
            .map((stock) => stock.product)
            .filter(
              (
                product,
              ): product is {
                id: string;
                name: string;
                registrationNumber: string | null;
              } => Boolean(product),
            )
            .reduce(
              (acc, product) =>
                acc.has(product.id)
                  ? acc
                  : acc.set(product.id, {
                      id: product.id,
                      name: product.name,
                      registrationNumber: product.registrationNumber ?? null,
                    }),
              new Map<
                string,
                {
                  readonly id: string;
                  readonly name: string;
                  readonly registrationNumber: string | null;
                }
              >(),
            )
            .values(),
        );
        const fieldsWithCompany = productionUnit.productionUnitsOnFields
          .map((relation) => relation.field)
          .filter(
            (
              field,
            ): field is {
              id: string;
              name: string;
              companyId: string;
              company: { id: string; name: string } | null;
            } => Boolean(field && field.companyId && field.company),
          )
          .filter((field) => companyIds.includes(field.companyId));
        if (fieldsWithCompany.length === 0) {
          return null;
        }
        const uniqueFields = Array.from(
          fieldsWithCompany
            .reduce(
              (acc, field) =>
                acc.has(field.id)
                  ? acc
                  : acc.set(field.id, {
                      id: field.id,
                      name: field.name,
                      companyId: field.companyId,
                      companyName: field.company?.name ?? '',
                      companyRecordId: field.company?.id ?? field.companyId,
                    }),
              new Map<
                string,
                {
                  id: string;
                  name: string;
                  companyId: string;
                  companyName: string;
                  companyRecordId: string;
                }
              >(),
            )
            .values(),
        );
        if (uniqueFields.length === 0) {
          return null;
        }
        const [primaryField] = uniqueFields;
        if (!primaryField) {
          return null;
        }
        const dosageAgentJobName = prismaJob.jobId
          ? dosageAgentJobsMap.get(prismaJob.jobId) ?? null
          : null;
        const machine = prismaJob.machine
          ? {
              id: prismaJob.machine.id,
              name: prismaJob.machine.name,
              identifier: prismaJob.machine.identifier,
              lastPositiveRevisionDate: prismaJob.machine.lastPositiveRevisionDate,
            }
          : null;
        return {
          job: Job.fromPrisma(prismaJob),
          productionUnit: {
            id: productionUnit.id,
            name: productionUnit.name,
            cropName: cycle.cropName,
            cropType: cycle.cropType,
            sauHa: productionUnit.areaHa,
          },
          products,
          fields: uniqueFields.map((field) => ({
            id: field.id,
            name: field.name,
          })) as ReadonlyArray<{ readonly id: string; readonly name: string }>,
          company: {
            id: primaryField.companyRecordId,
            name: primaryField.companyName,
          },
          machine,
          dosageAgentJobName,
        } as JobWithAssignmentDTO;
      })
      .filter((item): item is JobWithAssignmentDTO => item !== null);
    return { jobs, total };
  }

  async findManyByIdsWithProducts(jobIds: string[]): Promise<JobProductLinkDTO[]> {
    if (jobIds.length === 0) {
      return [];
    }
    const jobs = await this.prisma.job.findMany({
      where: { id: { in: jobIds } },
      select: {
        id: true,
        stocks: {
          select: {
            product: {
              select: {
                id: true,
                name: true,
                registrationNumber: true,
              },
            },
          },
        },
      },
    });
    const jobsById = new Map(
      jobs.map((job) => {
        const products = Array.from(
          job.stocks
            .map((stock) => stock.product)
            .filter(
              (
                product,
              ): product is {
                id: string;
                name: string;
                registrationNumber: string | null;
              } => Boolean(product),
            )
            .reduce(
              (acc, product) =>
                acc.has(product.id)
                  ? acc
                  : acc.set(product.id, {
                      id: product.id,
                      name: product.name,
                      registrationNumber: product.registrationNumber,
                    }),
              new Map<
                string,
                {
                  readonly id: string;
                  readonly name: string;
                  readonly registrationNumber: string | null;
                }
              >(),
            )
            .values(),
        );
        return [
          job.id,
          {
            jobId: job.id,
            stockCount: job.stocks.length,
            products,
          } as JobProductLinkDTO,
        ];
      }),
    );
    return jobIds
      .map((jobId) => jobsById.get(jobId))
      .filter((item): item is JobProductLinkDTO => !!item);
  }

  async findManyByIdsWithCompany(
    ids: string[],
  ): Promise<Array<{ job: Job; companyId: string | null }>> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.job.findMany({
      where: { id: { in: ids } },
      include: {
        productionUnit: {
          include: {
            productionUnitsOnFields: {
              include: { field: { select: { companyId: true } } },
              take: 1,
            },
          },
        },
      },
    });
    return rows.map((row) => ({
      job: Job.fromPrisma(row),
      companyId: row.productionUnit?.productionUnitsOnFields[0]?.field?.companyId ?? null,
    }));
  }

  async update(id: string, data: Partial<Job>): Promise<Job> {
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

  async delete(id: string): Promise<void> {
    await this.prisma.job.delete({ where: { id } });
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.job.deleteMany({ where: { id: { in: ids } } });
  }

  async findJobGroupsSummaryByUserId(userId: string): Promise<JobGroupSummaryDTO[]> {
    const memberships = await this.prisma.userOnCompany.findMany({
      where: { userId },
      select: { companyId: true },
    });
    const companyIds = memberships.map((membership) => membership.companyId);
    if (companyIds.length === 0) {
      return [];
    }
    const jobs = await this.prisma.job.findMany({
      where: {
        jobId: { not: null },
        productionUnit: {
          productionUnitsOnFields: {
            some: {
              field: {
                companyId: { in: companyIds },
              },
            },
          },
        },
      },
      select: {
        jobId: true,
        createdAt: true,
        isVerified: true,
        productionUnit: {
          select: {
            productionUnitsOnFields: {
              select: {
                field: {
                  select: {
                    company: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
              },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const groupsMap = new Map<
      string,
      {
        jobId: string;
        createdAt: Date;
        company: { id: string; name: string };
        totalOperations: number;
        verifiedOperations: number;
        pendingOperations: number;
      }
    >();
    for (const job of jobs) {
      if (!job.jobId) continue;
      const company = job.productionUnit?.productionUnitsOnFields[0]?.field?.company;
      if (!company) continue;
      const existing = groupsMap.get(job.jobId);
      if (existing) {
        existing.totalOperations += 1;
        if (job.isVerified) {
          existing.verifiedOperations += 1;
        } else {
          existing.pendingOperations += 1;
        }
      } else {
        groupsMap.set(job.jobId, {
          jobId: job.jobId,
          createdAt: job.createdAt,
          company: { id: company.id, name: company.name },
          totalOperations: 1,
          verifiedOperations: job.isVerified ? 1 : 0,
          pendingOperations: job.isVerified ? 0 : 1,
        });
      }
    }
    return Array.from(groupsMap.values());
  }

  private removeHistoryFromJob(job: Job): JobWithoutHistory {
    const { history: _history, ...jobWithoutHistory } = job;
    void _history;
    return jobWithoutHistory as JobWithoutHistory;
  }
}
