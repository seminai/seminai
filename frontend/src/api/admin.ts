import { customFetch } from '@/lib/api-client';

interface ApiEnvelope<TData> {
  readonly status: string;
  readonly data: TData;
}

export interface AdminAccessStatus {
  readonly isUnlocked: boolean;
  readonly durationMinutes: number;
}

export interface AdminUnlockPayload {
  readonly password: string;
}

export interface AdminUserCompanyMetrics {
  readonly companyId: string;
  readonly companyName: string;
  readonly companyRole: 'ADMIN' | 'EDITOR' | 'VIEWER' | null;
  readonly relationshipType: 'OWNER' | 'MEMBER' | 'OWNER_MEMBER';
  readonly usersCount: number;
  readonly fieldsCount: number;
  readonly productionUnitsCount: number;
  readonly warehouseProductsCount: number;
}

export interface AdminUserSummary {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly surname: string | null;
  readonly role: 'ADMIN' | 'GOD' | 'BASIC' | 'LABEL_MANAGER';
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
  readonly companies: ReadonlyArray<AdminUserCompanyMetrics>;
}

export interface AdminDashboardTotals {
  readonly totalUsers: number;
  readonly inactiveUsers: number;
  readonly blockedUsers: number;
  readonly deactivatedUsers: number;
  readonly totalCompanies: number;
  readonly totalOwnedCompanies: number;
  readonly totalJobs: number;
  readonly totalJobGroups: number;
}

export interface AdminDashboardSummary {
  readonly totals: AdminDashboardTotals;
  readonly users: ReadonlyArray<AdminUserSummary>;
}

export interface AdminSetUserBlockedPayload {
  readonly userId: string;
  readonly isBlocked: boolean;
  readonly reason?: string;
}

export async function getAdminAccessStatus(): Promise<AdminAccessStatus> {
  const response = await customFetch<ApiEnvelope<AdminAccessStatus>>({
    url: '/admin/access-status',
    method: 'GET',
  });
  return response.data;
}

export async function unlockAdminAccess(payload: AdminUnlockPayload): Promise<AdminAccessStatus> {
  const response = await customFetch<ApiEnvelope<AdminAccessStatus>>({
    url: '/admin/unlock',
    method: 'POST',
    data: payload,
  });
  return response.data;
}

export async function getAdminDashboardSummary(): Promise<AdminDashboardSummary> {
  const response = await customFetch<ApiEnvelope<AdminDashboardSummary>>({
    url: '/admin/data-totals',
    method: 'GET',
  });
  return response.data;
}

export async function setAdminUserBlockedStatus(payload: AdminSetUserBlockedPayload): Promise<void> {
  await customFetch({
    url: `/admin/users/${payload.userId}/block`,
    method: 'PATCH',
    data: {
      isBlocked: payload.isBlocked,
      reason: payload.reason,
    },
  });
}

export async function deactivateAdminUser(userId: string): Promise<void> {
  await customFetch({
    url: `/admin/users/${userId}/deactivate`,
    method: 'POST',
  });
}

export async function reactivateAdminUser(userId: string): Promise<void> {
  await customFetch({
    url: `/admin/users/${userId}/reactivate`,
    method: 'POST',
  });
}
