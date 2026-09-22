import { useMemo } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { useCompanies } from '@/hooks/use-company-options';
import { buildExportFilename } from '@/lib/export-filename';

interface UseExportFilenameOptions {
  /** Override the section name derived from the route. */
  readonly section?: string;
  /** Override the company name lookup. */
  readonly companyName?: string;
}

/**
 * Returns the canonical export filename for the current route + active company.
 * Pattern: `<gg-mm-aa>_<sezione>_<nome-azienda>`.
 */
export function useExportFilename(options: UseExportFilenameOptions = {}): string {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const companyIdFromUrl = useRouterState({
    select: (state) =>
      (state.location.search as { companyId?: string }).companyId,
  });
  const { companies } = useCompanies();

  return useMemo(() => {
    const section = options.section ?? firstPathSegment(pathname);
    const companyName =
      options.companyName ??
      companies.find((c) => c.id === companyIdFromUrl)?.name;
    return buildExportFilename({ section, companyName });
  }, [options.section, options.companyName, pathname, companyIdFromUrl, companies]);
}

function firstPathSegment(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  return segments[0] ?? '';
}
