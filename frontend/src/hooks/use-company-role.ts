import { useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useGetUserOnCompanyCompanyCompanyId } from '@/generated/api/user-on-company/user-on-company';
import { extractArray } from '@/lib/api-response';
import { CompanyRole } from '@/generated/prisma/enums';

export interface CompanyRoleInfo {
  readonly role: CompanyRole | null;
  readonly canManage: boolean;
  readonly membershipId: string | null;
  readonly isLoading: boolean;
}

export function useCompanyRole(companyId: string): CompanyRoleInfo {
  const { user } = useAuth();
  const { data, isLoading } = useGetUserOnCompanyCompanyCompanyId(companyId);

  return useMemo<CompanyRoleInfo>(() => {
    if (!user || !data?.data) {
      return { role: null, canManage: false, membershipId: null, isLoading };
    }
    const memberships = extractArray(data.data, 'usersOnCompany', 'users');
    const found = memberships.find((m) => {
      const nested = (m.user ?? m) as Record<string, unknown>;
      return String(nested.id ?? '') === user.id;
    });
    if (!found) {
      return { role: null, canManage: false, membershipId: null, isLoading };
    }
    const role = String(found.role ?? '') as CompanyRole;
    const canManage = role === CompanyRole.ADMIN || role === CompanyRole.EDITOR;
    return {
      role: role || null,
      canManage,
      membershipId: String(found.id ?? '') || null,
      isLoading,
    };
  }, [user, data, isLoading]);
}
