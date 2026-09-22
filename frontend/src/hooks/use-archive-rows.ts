import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { extractionKeys, useExtractionsList } from '@/hooks/use-extractions';
import { useExtractionProgress } from '@/hooks/use-extraction-progress';
import { useFieldNoteCompanies } from '@/hooks/use-field-notes';
import { useDosageAgentJobs } from '@/hooks/use-dosage-agent-job';
import { useWorkspace } from '@/hooks/use-workspace';
import { isManufacturingWorkspace } from '@/types/workspace';
import { formatJobGroupTitle, parseJobGroupCodeFromGeneratedId } from '@/lib/job-group-format';
import { formatDate } from '@/lib/format-date';
import type { DosageAgentJobListItem } from '@/types/planning';
import type {
  ArchiveListItem,
  ArchiveRow,
  DosageJobArchiveRow,
  ExtractionArchiveRow,
  EntityArchiveRow,
  FileExtractionListSortBy,
  FileExtractionListSortOrder,
  ResolvedCategory,
} from '@/types/extraction';
import type { FileExtractionStatus } from '@/types/prisma';

const STATUS_LABELS: Record<string, string> = {
  LOADING: 'In caricamento',
  PENDING_CONFIRMATION: 'Da confermare',
  CONFIRMED: 'Confermato',
  ERROR: 'Errore',
};

const CATEGORY_LABELS: Record<ResolvedCategory, string> = {
  fields: 'Campi',
  production_units: 'Unità Produttive',
  agricultural: 'Dati Agricoli',
  invoice: 'Fattura',
  ddt: 'DDT',
  stock: 'Magazzino',
};

const ACTIVE_DOSAGE_JOB_STATES = new Set(['queued', 'waiting', 'active', 'delayed', 'stalled']);

function extractionToRow(item: ArchiveListItem): ExtractionArchiveRow {
  const ext = item.fileName.split('.').pop();
  return {
    id: `extraction-${item.id}`,
    titolo: item.fileName,
    azienda: item.companyName,
    aggiornato: formatDate(item.updatedAt),
    aggiornatoIso: item.updatedAt,
    status: STATUS_LABELS[item.status] ?? String(item.status),
    tipoDiFile: CATEGORY_LABELS[item.category as ResolvedCategory] ?? String(item.category),
    formato: ext ? `.${ext}` : '-',
    note: item.error ?? '-',
    kind: 'extraction',
    extractionId: item.id,
    batchId: item.batchId ?? '',
    progress: item.progress,
    fileUrl: item.fileUrl,
    fileId: item.fileId ?? null,
    companyId: item.companyId,
    category: item.category as ResolvedCategory,
  };
}
function generatedToRow(item: ArchiveListItem): EntityArchiveRow {
  const type = item.generatedType ?? 'company';
  const jobGroupCode = type === 'job_group' ? parseJobGroupCodeFromGeneratedId(item.id) : null;
  return {
    id: normalizeGeneratedId(item),
    titolo: generatedTitle(type, jobGroupCode),
    azienda: item.companyName,
    aggiornato: formatDate(item.updatedAt),
    aggiornatoIso: item.updatedAt,
    status: generatedStatus(item, type),
    tipoDiFile: generatedFileType(type),
    formato: '-',
    note: item.note ?? '-',
    kind: 'entity',
    entityType: generatedEntityType(type),
    companyId: item.companyId,
    jobId: jobGroupCode ?? undefined,
    totalOperations: item.totalOperations,
    verifiedOperations: item.verifiedOperations,
    pendingOperations: item.pendingOperations,
  };
}
function dosageJobToRow(job: DosageAgentJobListItem): DosageJobArchiveRow {
  const updatedAt = job.updatedAt ?? job.createdAt ?? new Date().toISOString();
  return {
    id: `dosage-job-${job.id}`,
    titolo: formatJobGroupTitle(job.id),
    azienda: job.name ?? 'Pianificazione dosaggi',
    aggiornato: formatDate(updatedAt),
    aggiornatoIso: updatedAt,
    status: 'In caricamento',
    tipoDiFile: 'Gruppo operazioni',
    formato: '-',
    note: job.failedReason ?? job.state,
    kind: 'dosage-job',
    jobId: job.id,
    progress: job.progress,
    state: job.state,
  };
}
interface UseArchiveRowsParams {
  readonly companyId?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly q?: string;
  readonly fileNames?: readonly string[];
  readonly status?: readonly FileExtractionStatus[];
  readonly category?: readonly ResolvedCategory[];
  readonly sortBy: FileExtractionListSortBy;
  readonly sortOrder: FileExtractionListSortOrder;
  readonly updatedAtFrom?: string;
  readonly updatedAtTo?: string;
}
export function useArchiveRows(params: UseArchiveRowsParams): {
  rows: ArchiveRow[];
  isLoading: boolean;
  totalRows: number;
  extractionTotal: number;
} {
  const queryClient = useQueryClient();
  const previousActiveDosageCountRef = useRef(0);
  // Dosage jobs and field notes are user-scoped (no workspace header), so they
  // would leak agronomic rows into a manufacturing workspace's archive. Suppress
  // both client-side row sources there; BE-driven extraction rows are already scoped.
  const { activeWorkspaceKind } = useWorkspace();
  const isManufacturing = isManufacturingWorkspace(activeWorkspaceKind);
  const { data: extractionPage, isLoading: extractionLoading } = useExtractionsList({
    companyId: params.companyId,
    page: params.page,
    pageSize: params.pageSize,
    includeGenerated: true,
    q: params.q,
    fileNames: params.fileNames,
    status: params.status,
    category: params.category,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
    updatedAtFrom: params.updatedAtFrom,
    updatedAtTo: params.updatedAtTo,
  });
  const { data: dosageJobsPage, isLoading: dosageJobsLoading } = useDosageAgentJobs();
  const baseRows = useMemo<ArchiveRow[]>(() => {
    const items = extractionPage?.items;
    if (!items || items.length === 0) return [];
    return items.map((item) =>
      item.kind === 'generated' ? generatedToRow(item) : extractionToRow(item),
    );
  }, [extractionPage?.items]);
  const batchIds = useMemo(
    () => [
      ...new Set(
        baseRows
          .filter(
            (r): r is ExtractionArchiveRow =>
              r.kind === 'extraction' && r.status === 'In caricamento',
          )
          .map((r) => r.batchId),
      ),
    ],
    [baseRows],
  );
  const { getProgress } = useExtractionProgress(batchIds);
  const progressRows = useMemo<ArchiveRow[]>(
    () =>
      baseRows.map((row) => {
        if (row.kind !== 'extraction' || row.status !== 'In caricamento') return row;
        const live = getProgress(row.extractionId);
        if (!live || live.progress === row.progress) return row;
        return { ...row, progress: live.progress };
      }),
    [baseRows, getProgress],
  );
  const dosageJobRows = useMemo<DosageJobArchiveRow[]>(() => {
    if (isManufacturing || !shouldIncludeDosageRows(params)) return [];
    const jobs = dosageJobsPage?.data ?? [];
    return jobs
      .filter((job) => ACTIVE_DOSAGE_JOB_STATES.has(job.state))
      .map(dosageJobToRow)
      .filter((row) => matchesDosageRowFilters(row, params))
      .filter((row) => matchesUpdatedAtRange(row.aggiornatoIso, params));
  }, [dosageJobsPage?.data, params, isManufacturing]);
  const activeDosageJobCount = dosageJobRows.length;
  useEffect(() => {
    if (previousActiveDosageCountRef.current > 0 && activeDosageJobCount === 0) {
      void queryClient.invalidateQueries({ queryKey: extractionKeys.lists() });
    }
    previousActiveDosageCountRef.current = activeDosageJobCount;
  }, [activeDosageJobCount, queryClient]);
  const { companies: fieldNoteCompanies } = useFieldNoteCompanies();
  const fieldNoteRows = useMemo<EntityArchiveRow[]>(() => {
    if (isManufacturing || params.page !== 1 || fieldNoteCompanies.length === 0) return [];
    const filtered = params.companyId
      ? fieldNoteCompanies.filter((c) => c.id === params.companyId)
      : fieldNoteCompanies;
    return filtered
      .filter((company) => matchesUpdatedAtRange(company.latestUpdate, params))
      .map((company) => ({
        id: `field-notes-${company.id}`,
        titolo: 'Note di Campo',
        azienda: company.name,
        aggiornato: formatDate(company.latestUpdate),
        aggiornatoIso: company.latestUpdate,
        status: 'Generato',
        tipoDiFile: 'Note di campo',
        formato: '-',
        note: `${company.count} note`,
        kind: 'entity' as const,
        entityType: 'field-notes' as const,
        companyId: company.id,
      }));
  }, [fieldNoteCompanies, params, isManufacturing]);
  const rows = useMemo<ArchiveRow[]>(() => {
    const merged: ArchiveRow[] = [...dosageJobRows, ...progressRows, ...fieldNoteRows];
    if (params.sortBy !== 'updatedAt') return merged;
    const direction = params.sortOrder === 'asc' ? 1 : -1;
    return [...merged].sort((a, b) => {
      const aIso = a.aggiornatoIso ?? '';
      const bIso = b.aggiornatoIso ?? '';
      if (aIso === bIso) return 0;
      return aIso < bIso ? -direction : direction;
    });
  }, [dosageJobRows, fieldNoteRows, progressRows, params.sortBy, params.sortOrder]);
  const extractionTotal = extractionPage?.totalItems ?? extractionPage?.total ?? 0;
  return {
    rows,
    totalRows: extractionTotal + fieldNoteRows.length + dosageJobRows.length,
    extractionTotal,
    isLoading: extractionLoading || dosageJobsLoading,
  };
}
function generatedStatus(item: ArchiveListItem, type: string): string {
  if (type !== 'job_group') return 'Generato';
  return (item.pendingOperations ?? 0) > 0 ? 'Da verificare' : 'Confermato';
}
function generatedTitle(type: string, jobGroupCode: string | null): string {
  if (type === 'fields') return 'Campi';
  if (type === 'production_units') return 'Unità Produttive';
  if (type === 'products') return 'Magazzino';
  if (type === 'job_group') return formatJobGroupTitle(jobGroupCode);
  return 'Azienda';
}
function generatedFileType(type: string): string {
  if (type === 'fields') return 'Lista campi';
  if (type === 'production_units') return 'Lista unità produttive';
  if (type === 'products') return 'Lista prodotti';
  if (type === 'job_group') return 'Gruppo operazioni';
  return 'Informazioni aziendali';
}
function generatedEntityType(type: string): EntityArchiveRow['entityType'] {
  if (type === 'fields') return 'fields';
  if (type === 'production_units') return 'production-units';
  if (type === 'products') return 'products';
  if (type === 'job_group') return 'jobs';
  return 'company';
}
function normalizeGeneratedId(item: ArchiveListItem): string {
  if (item.generatedType === 'job_group') {
    const legacyMatch = item.id.match(/^generated-job_group-([0-9a-f-]{36})-/i);
    if (legacyMatch) {
      const [, companyId] = legacyMatch;
      return `jobs-${companyId}`;
    }
  }
  if (item.generatedType === 'company') {
    const legacyMatch = item.id.match(/^generated-company-([0-9a-f-]{36})-/i);
    if (legacyMatch) return `company-${legacyMatch[1]}`;
  }
  if (item.generatedType === 'fields') {
    const legacyMatch = item.id.match(/^generated-fields-([0-9a-f-]{36})-/i);
    if (legacyMatch) return `fields-${legacyMatch[1]}`;
  }
  if (item.generatedType === 'production_units') {
    const legacyMatch = item.id.match(/^generated-production_units-([0-9a-f-]{36})-/i);
    if (legacyMatch) return `pu-${legacyMatch[1]}`;
  }
  return item.id;
}
function shouldIncludeDosageRows(params: UseArchiveRowsParams): boolean {
  if (params.page !== 1) return false;
  if (params.category && params.category.length > 0) return false;
  return !params.status || params.status.length === 0 || params.status.includes('LOADING');
}
function matchesDosageRowFilters(row: DosageJobArchiveRow, params: UseArchiveRowsParams): boolean {
  const q = params.q?.trim().toLowerCase();
  const fileNames = params.fileNames?.map((name) => name.toLowerCase());
  const searchable = `${row.titolo} ${row.azienda} ${row.tipoDiFile} ${row.note}`.toLowerCase();
  if (q && !searchable.includes(q)) return false;
  if (!fileNames || fileNames.length === 0) return true;
  return fileNames.some((fileName) => row.titolo.toLowerCase().includes(fileName));
}
function matchesUpdatedAtRange(iso: string, params: UseArchiveRowsParams): boolean {
  if (!params.updatedAtFrom && !params.updatedAtTo) return true;
  if (!iso) return false;
  if (params.updatedAtFrom && iso < params.updatedAtFrom) return false;
  if (params.updatedAtTo && iso > `${params.updatedAtTo}T23:59:59.999Z`) return false;
  return true;
}
