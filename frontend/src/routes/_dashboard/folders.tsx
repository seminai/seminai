import { createFileRoute, redirect } from '@tanstack/react-router';

interface FoldersSearch {
  readonly companyId?: string;
}

export const Route = createFileRoute('/_dashboard/folders')({
  validateSearch: (search: Record<string, unknown>): FoldersSearch => ({
    companyId: typeof search.companyId === 'string' ? search.companyId : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: '/archivio',
      search: search.companyId ? { companyId: search.companyId } : {},
    });
  },
  component: () => null,
});
