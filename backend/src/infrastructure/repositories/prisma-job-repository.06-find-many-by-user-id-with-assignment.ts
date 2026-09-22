import { Prisma } from '@prisma/client';
import { Job } from '../../domain/entities/Job';
import { JobWithAssignmentDTO } from '../../domain/dtos/job-assignment.dto';
import type { PrismaJobRepositoryContext } from './prisma-job-repository.context';

export async function prismaJobRepositoryFindManyByUserIdWithAssignment(this: PrismaJobRepositoryContext, userId: string, companyName?: string, jobId?: string): Promise<JobWithAssignmentDTO[]> {
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
