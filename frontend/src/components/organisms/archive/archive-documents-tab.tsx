import { useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PaginationState } from "@tanstack/react-table";
import { ArchiveFilesTable } from "@/components/organisms/archive-files-table";
import { PendingJobBanner } from "@/components/molecules/pending-job-banner";
import { useTabs, type TabData } from "@/hooks/use-tabs";
import { useWorkspace } from "@/hooks/use-workspace";
import { usePersistedFilters } from "@/hooks/use-persisted-filters";
import { useDebounce } from "@/hooks/use-debounce";
import { extractionKeys } from "@/hooks/use-extractions";
import { useArchiveRows } from "@/hooks/use-archive-rows";
import { useArchiveDeleteFlow } from "@/hooks/use-archive-delete-flow";
import { useCompanies } from "@/hooks/use-company-options";
import { useFilterOptions } from "@/hooks/use-filter-options";
import { formatJobGroupTitle } from "@/lib/job-group-format";
import type {
  ArchiveRow,
  FileExtractionListSortBy,
  ResolvedCategory,
} from "@/types/extraction";
import type { FileExtractionStatus } from "@/types/prisma";

interface ArchiveDocumentsTabProps {
  readonly companyId?: string;
}

export function ArchiveDocumentsTab({ companyId }: ArchiveDocumentsTabProps) {
  const queryClient = useQueryClient();
  const { addTab, addTabs, tabs } = useTabs();
  const { activeWorkspaceId, workspaces } = useWorkspace();
  const { columnFilters, setColumnFilters, sorting, setSorting, clearFilters } =
    usePersistedFilters(activeWorkspaceId);
  const [paginationState, setPaginationState] = useState<
    PaginationState & { scopeKey: string }
  >({ pageIndex: 0, pageSize: 25, scopeKey: "initial" });
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput.trim(), 300);
  const debouncedColumnFilters = useDebounce(columnFilters, 250);
  const { companies } = useCompanies();
  const filterOptions = useFilterOptions();
  const companyTabId = companyId ? `company:${companyId}` : null;
  const resolvedCompanyName = useMemo(
    () => (companyId ? companies.find((c) => c.id === companyId)?.name : undefined),
    [companyId, companies],
  );
  const resolvedWorkspaceName = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId)?.name,
    [workspaces, activeWorkspaceId],
  );

  const pendingJobIdFromState = useRouterState({
    select: (s) => {
      const state = s.location.state as unknown as
        | Record<string, unknown>
        | undefined;
      const jobId = state?.pendingJobId;
      return typeof jobId === "string" ? jobId : null;
    },
  });
  const [pendingJobId, setPendingJobId] = useState<string | null>(
    () => pendingJobIdFromState,
  );

  const handleJobCompleted = useCallback(
    (jobId: string) => {
      setPendingJobId(null);
      void queryClient.invalidateQueries({ queryKey: extractionKeys.lists() });
      addTab({
        id: `job-${jobId}`,
        title: formatJobGroupTitle(jobId),
        subtitle: "",
        format: "-",
        source: "archivio",
      });
    },
    [addTab, queryClient],
  );
  const handleOpenSelected = useCallback(
    (rows: readonly ArchiveRow[]) => {
      addTabs(rows.map(archiveRowToTab));
    },
    [addTabs],
  );
  const [selectionResetKey, setSelectionResetKey] = useState(0);
  const { requestDelete, dialog: deleteDialog } = useArchiveDeleteFlow({
    onDeleteSuccess: () => setSelectionResetKey((k) => k + 1),
  });

  const currentScopeKey = JSON.stringify({
    companyId: companyId ?? "all",
    debouncedSearch,
    columnFilters: debouncedColumnFilters,
    sorting,
  });

  const handleClearFilters = () => {
    clearFilters();
    setSearchInput("");
    setPaginationState((previous) => ({
      ...previous,
      pageIndex: 0,
      scopeKey: currentScopeKey,
    }));
  };

  useEffect(() => {
    if (!companyTabId || !resolvedCompanyName) return;
    const existing = tabs.find((tab) => tab.id === companyTabId);
    if (existing?.title === resolvedCompanyName && existing?.subtitle === resolvedWorkspaceName) return;
    addTab({
      id: companyTabId,
      title: resolvedCompanyName,
      subtitle: resolvedWorkspaceName,
      format: "-",
      source: "archivio",
    });
  }, [companyTabId, resolvedCompanyName, resolvedWorkspaceName, addTab, tabs]);

  const selectedStatuses = useMemo<
    readonly FileExtractionStatus[] | undefined
  >(() => {
    const statusFilter = debouncedColumnFilters.find((filter) => filter.id === "status");
    const values = Array.isArray(statusFilter?.value) ? statusFilter.value : [];
    const mapped = values
      .map((value) => statusLabelToApi(String(value)))
      .filter((value): value is FileExtractionStatus => value !== undefined);
    return mapped.length > 0 ? mapped : undefined;
  }, [debouncedColumnFilters]);

  const selectedCompanyId = useMemo<string | undefined>(() => {
    if (companyId) return companyId;
    const aziendaFilter = debouncedColumnFilters.find(
      (filter) => filter.id === "azienda",
    );
    const values = Array.isArray(aziendaFilter?.value)
      ? aziendaFilter.value
      : [];
    if (values.length === 0) return undefined;
    const match = companies.find((c) => values.includes(c.name));
    return match?.id;
  }, [companyId, debouncedColumnFilters, companies]);

  const selectedFileNames = useMemo<readonly string[] | undefined>(() => {
    const titoloFilter = debouncedColumnFilters.find((filter) => filter.id === "titolo");
    const values = Array.isArray(titoloFilter?.value) ? titoloFilter.value : [];
    return values.length > 0 ? values.map(String) : undefined;
  }, [debouncedColumnFilters]);

  const selectedCategories = useMemo<
    readonly ResolvedCategory[] | undefined
  >(() => {
    const categoryFilter = debouncedColumnFilters.find(
      (filter) => filter.id === "tipoDiFile",
    );
    const values = Array.isArray(categoryFilter?.value)
      ? categoryFilter.value
      : [];
    const mapped = values
      .map((value) => categoryLabelToApi(String(value)))
      .filter((value): value is ResolvedCategory => value !== undefined);
    return mapped.length > 0 ? mapped : undefined;
  }, [debouncedColumnFilters]);

  const { updatedAtFrom, updatedAtTo } = useMemo<{
    updatedAtFrom?: string;
    updatedAtTo?: string;
  }>(() => {
    const dateFilter = debouncedColumnFilters.find(
      (filter) => filter.id === "aggiornato",
    );
    const value = dateFilter?.value as
      | { from?: string; to?: string }
      | undefined;
    if (!value) return {};
    return {
      updatedAtFrom: value.from || undefined,
      updatedAtTo: value.to || undefined,
    };
  }, [debouncedColumnFilters]);

  const { sortBy, sortOrder } = useMemo(() => {
    const firstSort = sorting[0];
    if (!firstSort) {
      return {
        sortBy: "updatedAt" as FileExtractionListSortBy,
        sortOrder: "desc" as const,
      };
    }
    return {
      sortBy: sortingToApi(firstSort.id),
      sortOrder: firstSort.desc ? ("desc" as const) : ("asc" as const),
    };
  }, [sorting]);

  const pagination = useMemo<PaginationState>(
    () => ({
      pageIndex:
        paginationState.scopeKey === currentScopeKey
          ? paginationState.pageIndex
          : 0,
      pageSize: paginationState.pageSize,
    }),
    [
      currentScopeKey,
      paginationState.pageIndex,
      paginationState.pageSize,
      paginationState.scopeKey,
    ],
  );

  const { rows, totalRows, extractionTotal } = useArchiveRows({
    companyId: selectedCompanyId,
    page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize,
    q: debouncedSearch || undefined,
    fileNames: selectedFileNames,
    status: selectedStatuses,
    category: selectedCategories,
    sortBy,
    sortOrder,
    updatedAtFrom,
    updatedAtTo,
  });

  const pageCount = useMemo(
    () => Math.max(Math.ceil(extractionTotal / pagination.pageSize), 1),
    [extractionTotal, pagination.pageSize],
  );
  const handlePaginationChange = (nextPagination: PaginationState) => {
    setPaginationState({
      pageIndex: nextPagination.pageIndex,
      pageSize: nextPagination.pageSize,
      scopeKey: currentScopeKey,
    });
  };
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {pendingJobId && (
        <div className="mb-4">
          <PendingJobBanner
            jobId={pendingJobId}
            onCompleted={handleJobCompleted}
          />
        </div>
      )}
      <ArchiveFilesTable
        files={rows}
        totalCount={totalRows}
        columnFilters={columnFilters}
        onColumnFiltersChange={setColumnFilters}
        sorting={sorting}
        onSortingChange={setSorting}
        onClearFilters={handleClearFilters}
        searchValue={searchInput}
        onSearchValueChange={setSearchInput}
        pagination={pagination}
        onPaginationChange={handlePaginationChange}
        pageCount={pageCount}
        filterOptions={filterOptions}
        onOpenSelected={handleOpenSelected}
        onDeleteRequest={requestDelete}
        onRowClick={(file) => addTab(archiveRowToTab(file))}
        selectionResetKey={selectionResetKey}
      />
      {deleteDialog}
    </div>
  );
}
function archiveRowToTab(file: ArchiveRow): TabData {
  return {
    id: file.kind === "dosage-job" ? `job-${file.jobId}` : file.id,
    title: file.titolo,
    subtitle: file.azienda,
    format: file.formato,
    source: "archivio",
  };
}
function statusLabelToApi(value: string): FileExtractionStatus | undefined {
  if (value === "In caricamento") return "LOADING";
  if (value === "Da confermare") return "PENDING_CONFIRMATION";
  if (value === "Confermato") return "CONFIRMED";
  if (value === "Errore") return "ERROR";
  return undefined;
}
function categoryLabelToApi(value: string): ResolvedCategory | undefined {
  if (value === "Campi") return "fields";
  if (value === "Unità Produttive") return "production_units";
  if (value === "Dati Agricoli") return "agricultural";
  if (value === "Fattura") return "invoice";
  if (value === "DDT") return "ddt";
  if (value === "Magazzino") return "stock";
  return undefined;
}
function sortingToApi(columnId: string): FileExtractionListSortBy {
  if (columnId === "titolo") return "fileName";
  if (columnId === "status") return "status";
  if (columnId === "tipoDiFile") return "category";
  return "updatedAt";
}
