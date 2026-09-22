import { CompanyRole, PrismaClient } from '@prisma/client';
import {
  AdminDashboardSummaryDTO,
  AdminUserCompanyMetricsDTO,
  AdminUserSummaryDTO,
} from '../../domain/dtos/admin-dashboard.dto';
import { IAdminRepository } from '../../domain/repositories/IAdminRepository';

const INACTIVE_THRESHOLD_DAYS = 7;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

type CompanyMetrics = {
  readonly companyId: string;
  readonly companyName: string;
  readonly usersCount: number;
  readonly fieldsCount: number;
  readonly productionUnitsCount: number;
  readonly warehouseProductsCount: number;
  readonly ownerId: string | null;
};

type AccessibleJobMetrics = {
  readonly jobsCount: number;
  readonly jobGroupsCount: number;
  readonly unverifiedJobsCount: number;
};

function toIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function calculateDaysSinceLastAccess(lastAccessAt: Date | null): number | null {
  if (!lastAccessAt) {
    return null;
  }
  return Math.floor((Date.now() - lastAccessAt.getTime()) / MILLISECONDS_PER_DAY);
}

function buildRelationshipType(
  isOwned: boolean,
  companyRole: CompanyRole | null,
): AdminUserCompanyMetricsDTO['relationshipType'] {
  if (isOwned && companyRole) {
    return 'OWNER_MEMBER';
  }
  if (isOwned) {
    return 'OWNER';
  }
  return 'MEMBER';
}

function countDistinctProductionUnits(
  fields: Array<{ productionUnitsOnFields: Array<{ productionUnitId: string }> }>,
): number {
  return new Set(
    fields.flatMap((field) =>
      field.productionUnitsOnFields.map((productionUnit) => productionUnit.productionUnitId),
    ),
  ).size;
}

export class PrismaAdminRepository implements IAdminRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getDashboardSummary(): Promise<AdminDashboardSummaryDTO> {
    const [users, companies, jobs] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: [{ isDeactivated: 'asc' }, { isBlocked: 'asc' }, { lastAccessAt: 'desc' }],
        select: {
          id: true,
          email: true,
          name: true,
          surname: true,
          role: true,
          lastAccessAt: true,
          isBlocked: true,
          blockedAt: true,
          blockedReason: true,
          isDeactivated: true,
          deactivatedAt: true,
          deactivatedReason: true,
          companyUsers: {
            select: {
              companyId: true,
              role: true,
            },
          },
        },
      }),
      this.prisma.company.findMany({
        select: {
          id: true,
          name: true,
          ownerId: true,
          _count: {
            select: {
              companyUsers: true,
              fields: true,
            },
          },
          fields: {
            select: {
              productionUnitsOnFields: {
                select: {
                  productionUnitId: true,
                },
              },
            },
          },
          warehouses: {
            select: {
              products: {
                select: {
                  id: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.job.findMany({
        select: {
          id: true,
          jobId: true,
          isVerified: true,
          productionUnit: {
            select: {
              productionUnitsOnFields: {
                select: {
                  field: {
                    select: {
                      companyId: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const companyMetricsMap = new Map<string, CompanyMetrics>();
    const ownedCompanyIdsByUserId = new Map<string, string[]>();

    for (const company of companies) {
      companyMetricsMap.set(company.id, {
        companyId: company.id,
        companyName: company.name,
        ownerId: company.ownerId ?? null,
        usersCount: company._count.companyUsers,
        fieldsCount: company._count.fields,
        productionUnitsCount: countDistinctProductionUnits(company.fields),
        warehouseProductsCount: company.warehouses.reduce(
          (total, warehouse) => total + warehouse.products.length,
          0,
        ),
      });
      if (company.ownerId) {
        const current = ownedCompanyIdsByUserId.get(company.ownerId) ?? [];
        current.push(company.id);
        ownedCompanyIdsByUserId.set(company.ownerId, current);
      }
    }

    const jobsByCompanyId = new Map<
      string,
      Array<{
        readonly id: string;
        readonly jobId: string | null;
        readonly isVerified: boolean;
      }>
    >();

    for (const job of jobs) {
      const companyIds = Array.from(
        new Set(
          job.productionUnit.productionUnitsOnFields
            .map((relation) => relation.field.companyId)
            .filter((companyId): companyId is string => Boolean(companyId)),
        ),
      );

      for (const companyId of companyIds) {
        const companyJobs = jobsByCompanyId.get(companyId) ?? [];
        companyJobs.push({
          id: job.id,
          jobId: job.jobId,
          isVerified: job.isVerified,
        });
        jobsByCompanyId.set(companyId, companyJobs);
      }
    }

    const accessibleJobMetricsByUserId = new Map<string, AccessibleJobMetrics>();

    for (const user of users) {
      const membershipCompanyIds = Array.from(
        new Set(user.companyUsers.map((companyUser) => companyUser.companyId)),
      );
      const accessibleJobs = Array.from(
        membershipCompanyIds
          .reduce(
            (accumulator, companyId) => {
              const companyJobs = jobsByCompanyId.get(companyId) ?? [];
              for (const job of companyJobs) {
                if (!accumulator.has(job.id)) {
                  accumulator.set(job.id, job);
                }
              }
              return accumulator;
            },
            new Map<
              string,
              {
                readonly id: string;
                readonly jobId: string | null;
                readonly isVerified: boolean;
              }
            >(),
          )
          .values(),
      );

      accessibleJobMetricsByUserId.set(user.id, {
        jobsCount: accessibleJobs.length,
        jobGroupsCount: new Set(
          accessibleJobs.map((job) => job.jobId).filter((jobId): jobId is string => Boolean(jobId)),
        ).size,
        unverifiedJobsCount: accessibleJobs.filter((job) => !job.isVerified).length,
      });
    }

    const userSummaries = users.map<AdminUserSummaryDTO>((user) => {
      const ownedCompanyIds = ownedCompanyIdsByUserId.get(user.id) ?? [];
      const memberRolesByCompanyId = new Map<string, CompanyRole>(
        user.companyUsers.map((companyUser) => [companyUser.companyId, companyUser.role]),
      );
      const relevantCompanyIds = Array.from(
        new Set([
          ...ownedCompanyIds,
          ...user.companyUsers.map((companyUser) => companyUser.companyId),
        ]),
      );
      const companiesForUser = relevantCompanyIds
        .map((companyId) => {
          const metrics = companyMetricsMap.get(companyId);
          if (!metrics) {
            return null;
          }
          const companyRole = memberRolesByCompanyId.get(companyId) ?? null;
          const isOwned = ownedCompanyIds.includes(companyId);
          return {
            companyId: metrics.companyId,
            companyName: metrics.companyName,
            companyRole,
            relationshipType: buildRelationshipType(isOwned, companyRole),
            usersCount: metrics.usersCount,
            fieldsCount: metrics.fieldsCount,
            productionUnitsCount: metrics.productionUnitsCount,
            warehouseProductsCount: metrics.warehouseProductsCount,
          };
        })
        .filter((company): company is AdminUserCompanyMetricsDTO => company !== null)
        .sort((left, right) => left.companyName.localeCompare(right.companyName));
      const accessibleJobMetrics = accessibleJobMetricsByUserId.get(user.id) ?? {
        jobsCount: 0,
        jobGroupsCount: 0,
        unverifiedJobsCount: 0,
      };
      const daysSinceLastAccess = calculateDaysSinceLastAccess(user.lastAccessAt);
      return {
        userId: user.id,
        email: user.email,
        name: user.name,
        surname: user.surname,
        role: user.role,
        lastAccessAt: toIsoString(user.lastAccessAt),
        daysSinceLastAccess,
        isInactive: daysSinceLastAccess === null || daysSinceLastAccess > INACTIVE_THRESHOLD_DAYS,
        isBlocked: user.isBlocked,
        blockedAt: toIsoString(user.blockedAt),
        blockedReason: user.blockedReason,
        isDeactivated: user.isDeactivated,
        deactivatedAt: toIsoString(user.deactivatedAt),
        deactivatedReason: user.deactivatedReason,
        ownedCompaniesCount: ownedCompanyIds.length,
        associatedCompaniesCount: user.companyUsers.length,
        unverifiedJobsCount: accessibleJobMetrics.unverifiedJobsCount,
        totalRelevantCompaniesCount: companiesForUser.length,
        jobGroupsCount: accessibleJobMetrics.jobGroupsCount,
        jobsCount: accessibleJobMetrics.jobsCount,
        companies: companiesForUser,
      };
    });

    return {
      totals: {
        totalUsers: userSummaries.length,
        inactiveUsers: userSummaries.filter((user) => user.isInactive).length,
        blockedUsers: userSummaries.filter((user) => user.isBlocked).length,
        deactivatedUsers: userSummaries.filter((user) => user.isDeactivated).length,
        totalCompanies: companies.length,
        totalOwnedCompanies: companies.filter((company) => company.ownerId).length,
        totalJobs: userSummaries.reduce((total, user) => total + user.jobsCount, 0),
        totalJobGroups: userSummaries.reduce((total, user) => total + user.jobGroupsCount, 0),
      },
      users: userSummaries,
    };
  }
}
