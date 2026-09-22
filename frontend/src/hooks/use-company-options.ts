import { useMemo } from 'react';
import { useGetCompanies } from '@/generated/api/companies/companies';
import type { CompanyOption } from '@/config/upload-options';
import { useAuth } from '@/hooks/use-auth';
import { useWorkspace } from '@/hooks/use-workspace';
import { parseCompanyKind, type CompanyKind } from '@/types/company-kind';
import { isLikelyTechnicalId } from '@/lib/safe-display';

const DEFAULT_WORKSPACE_ID = 'seminai-default';

interface CompanyFromApi {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
  readonly kind: CompanyKind;
}

interface UseCompaniesOptions {
  readonly scope?: 'workspace' | 'all';
}

function resolveWorkspaceQuery(scope: 'workspace' | 'all', activeWorkspaceId: string) {
  if (scope === 'all' || activeWorkspaceId === DEFAULT_WORKSPACE_ID) {
    return undefined;
  }
  return { workspaceId: activeWorkspaceId };
}

/**
 * Returns a list of { value: companyId, label: companyName } options
 * from the real companies API.
 */
export function useCompanyOptions(options?: UseCompaniesOptions) {
  const scope = options?.scope ?? 'workspace';
  const { isAuthenticated } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const params = resolveWorkspaceQuery(scope, activeWorkspaceId);
  const { data: response, isLoading } = useGetCompanies(params, {
    query: { enabled: isAuthenticated },
  });
  const companies = useMemo<CompanyOption[]>(() => {
    const list = normalizeCompanies(response?.data as unknown);
    return list.map((company) => ({
      value: company.id,
      label: company.name,
      kind: company.kind,
    }));
  }, [response]);
  return { companies, isLoading };
}

/** Returns the raw company list for other hooks that need id + name. */
export function useCompanies(options?: UseCompaniesOptions) {
  const scope = options?.scope ?? 'workspace';
  const { isAuthenticated } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const params = resolveWorkspaceQuery(scope, activeWorkspaceId);
  const { data: response, isLoading } = useGetCompanies(params, {
    query: { enabled: isAuthenticated },
  });
  const companies = useMemo<CompanyFromApi[]>(() => {
    return normalizeCompanies(response?.data as unknown);
  }, [response]);
  return { companies, isLoading };
}

function normalizeCompanies(raw: unknown): CompanyFromApi[] {
  const candidates = collectCompanyRecords(raw);
  const seen = new Set<string>();
  const normalized = candidates.flatMap((item, index) => {
    const id = String(item.id ?? '').trim();
    if (!id || seen.has(id)) return [];
    seen.add(id);

    const rawName = pickFirstNonEmpty(
      item.name,
      item.companyName,
      item.businessName,
      item.legalName,
      item.displayName,
      item.title,
    );
    const safeName =
      rawName && !isUnsafeCompanyLabel(rawName) ? rawName : `Azienda ${index + 1}`;
    const updatedAt = String(item.updatedAt ?? item.createdAt ?? new Date(0).toISOString());
    const kind = parseCompanyKind(item.kind);
    return [{ id, name: safeName, updatedAt, kind }];
  });

  return normalized.sort((left, right) => left.name.localeCompare(right.name, 'it'));
}

function isUnsafeCompanyLabel(value: string): boolean {
  const trimmed = value.trim();
  return isLikelyTechnicalId(trimmed) || /^\d{3,}$/.test(trimmed);
}

function pickFirstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text.length > 0) return text;
  }
  return null;
}

function collectCompanyRecords(raw: unknown): Array<Record<string, unknown>> {
  const queue: unknown[] = [raw];
  const records: Array<Record<string, unknown>> = [];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    if (Array.isArray(current)) {
      current.forEach((item) => queue.push(item));
      continue;
    }

    if (typeof current !== 'object') continue;
    const object = current as Record<string, unknown>;

    if (typeof object.id === 'string' || typeof object.id === 'number') {
      const hasCompanyField =
        'name' in object ||
        'companyName' in object ||
        'businessName' in object ||
        'legalName' in object;
      if (hasCompanyField) records.push(object);
    }

    Object.values(object).forEach((value) => queue.push(value));
  }
  return records;
}
