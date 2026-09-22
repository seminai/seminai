import { useMemo } from 'react';
import { useGetCompaniesId } from '@/generated/api/companies/companies';
import { extractObject } from '@/lib/api-response';
import { isAgriculturalCompany, parseCompanyKind, type CompanyKind } from '@/types/company-kind';

interface UseCompanyKindResult {
  readonly kind: CompanyKind;
  readonly isAgricultural: boolean;
  readonly isLoading: boolean;
}

export function useCompanyKind(companyId: string): UseCompanyKindResult {
  const { data: companyRes, isLoading } = useGetCompaniesId(companyId);

  const kind = useMemo(() => {
    if (!companyRes?.data) return 'AGRICULTURAL' as const;
    const obj = extractObject(companyRes.data, 'company');
    return parseCompanyKind(obj?.kind);
  }, [companyRes]);

  return {
    kind,
    isAgricultural: isAgriculturalCompany(kind),
    isLoading,
  };
}
