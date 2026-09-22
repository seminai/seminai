import { CompanyRole, UserRole } from '@prisma/client';

export interface AdminUserCompanyMetricsDTO {
  readonly companyId: string;
  readonly companyName: string;
  readonly companyRole: CompanyRole | null;
  readonly relationshipType: 'OWNER' | 'MEMBER' | 'OWNER_MEMBER';
  readonly usersCount: number;
  readonly fieldsCount: number;
  readonly productionUnitsCount: number;
  readonly warehouseProductsCount: number;
}

export interface AdminUserSummaryDTO {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly surname: string | null;
  readonly role: UserRole;
  readonly lastAccessAt: string | null;
  readonly daysSinceLastAccess: number | null;
  readonly isInactive: boolean;
  readonly isBlocked: boolean;
  readonly blockedAt: string | null;
  readonly blockedReason: string | null;
  readonly isDeactivated: boolean;
  readonly deactivatedAt: string | null;
  readonly deactivatedReason: string | null;
  readonly ownedCompaniesCount: number;
  readonly associatedCompaniesCount: number;
  readonly totalRelevantCompaniesCount: number;
  readonly jobGroupsCount: number;
  readonly jobsCount: number;
  readonly unverifiedJobsCount: number;
  readonly companies: ReadonlyArray<AdminUserCompanyMetricsDTO>;
}

export interface AdminDashboardTotalsDTO {
  readonly totalUsers: number;
  readonly inactiveUsers: number;
  readonly blockedUsers: number;
  readonly deactivatedUsers: number;
  readonly totalCompanies: number;
  readonly totalOwnedCompanies: number;
  readonly totalJobs: number;
  readonly totalJobGroups: number;
}

export interface AdminDashboardSummaryDTO {
  readonly totals: AdminDashboardTotalsDTO;
  readonly users: ReadonlyArray<AdminUserSummaryDTO>;
}
