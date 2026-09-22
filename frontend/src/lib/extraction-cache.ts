import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { extractionKeys } from '@/hooks/use-extractions';
import type {
  ArchiveListItem,
  FileExtractionListPayload,
  FileExtractionResponse,
} from '@/types/extraction';

export interface RemoveExtractionsInput {
  readonly fileIds: readonly string[];
  readonly extractionIds: readonly string[];
}

export type CacheSnapshot = readonly [QueryKey, unknown];

export interface RemoveExtractionsResult {
  readonly snapshots: readonly CacheSnapshot[];
}

function isPaginatedPayload(value: unknown): value is FileExtractionListPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { extractions?: unknown }).extractions)
  );
}

function isExtractionArray(value: unknown): value is readonly FileExtractionResponse[] {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return true;
  const first = value[0] as { id?: unknown; fileName?: unknown } | undefined;
  return typeof first?.id === 'string' && typeof first?.fileName === 'string';
}

function filterPaginated(
  payload: FileExtractionListPayload,
  extractionIdSet: ReadonlySet<string>,
  fileIdSet: ReadonlySet<string>,
): FileExtractionListPayload {
  const nextExtractions = payload.extractions.filter((e) => !extractionIdSet.has(e.id));
  const removedExtractions = payload.extractions.length - nextExtractions.length;

  let nextItems: readonly ArchiveListItem[] | undefined = payload.items;
  let removedItems = 0;
  if (payload.items) {
    nextItems = payload.items.filter((item) => {
      const matchByExtraction = item.kind === 'extraction' && extractionIdSet.has(item.id);
      const matchByFile = item.fileId != null && fileIdSet.has(item.fileId);
      return !matchByExtraction && !matchByFile;
    });
    removedItems = payload.items.length - nextItems.length;
  }

  return {
    ...payload,
    extractions: nextExtractions,
    items: nextItems,
    total: Math.max(0, payload.total - removedExtractions),
    totalItems:
      payload.totalItems !== undefined
        ? Math.max(0, payload.totalItems - removedItems)
        : payload.totalItems,
  };
}

export function removeExtractionsFromCaches(
  queryClient: QueryClient,
  { fileIds, extractionIds }: RemoveExtractionsInput,
): RemoveExtractionsResult {
  const extractionIdSet = new Set(extractionIds);
  const fileIdSet = new Set(fileIds);
  const snapshots: CacheSnapshot[] = [];

  const entries = queryClient.getQueriesData({ queryKey: extractionKeys.lists() });
  for (const [key, data] of entries) {
    if (data === undefined) continue;
    snapshots.push([key, data]);

    if (isPaginatedPayload(data)) {
      queryClient.setQueryData<FileExtractionListPayload>(key, (old) =>
        old ? filterPaginated(old, extractionIdSet, fileIdSet) : old,
      );
      continue;
    }

    if (isExtractionArray(data)) {
      queryClient.setQueryData<readonly FileExtractionResponse[]>(key, (old) =>
        old ? old.filter((e) => !extractionIdSet.has(e.id)) : old,
      );
    }
  }

  return { snapshots };
}

export function restoreExtractionCaches(
  queryClient: QueryClient,
  snapshots: readonly CacheSnapshot[],
): void {
  for (const [key, data] of snapshots) {
    queryClient.setQueryData(key, data);
  }
}
