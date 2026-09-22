import { JobGroupSummaryDTO } from '../../domain/dtos/job-group-summary.dto';
import type { PrismaJobRepositoryContext } from './prisma-job-repository.context';

export async function prismaJobRepositoryFindJobGroupsSummaryByUserId(this: PrismaJobRepositoryContext, userId: string): Promise<JobGroupSummaryDTO[]> {
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
