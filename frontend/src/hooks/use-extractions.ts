import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { customFetch, multipartFetch, ApiError } from '@/lib/api-client';
import {
  removeExtractionsFromCaches,
  restoreExtractionCaches,
  type RemoveExtractionsResult,
} from '@/lib/extraction-cache';
import type { ExtractionBatch } from '@/lib/build-extraction-batches';
import type {
  BatchExtractionStartResponse,
  CompanyExtractionCategorySummary,
  ConfirmExtractionPayload,
  FileExtractionListPayload,
  FileExtractionListQuery,
  FileExtractionResponse,
} from '@/types/extraction';

interface ApiListResponse {
  readonly status: string;
  readonly data: FileExtractionListPayload;
}

interface ApiCategorySummaryResponse {
  readonly status: string;
  readonly data: { readonly categories: readonly CompanyExtractionCategorySummary[] };
}

interface ApiDetailResponse {
  readonly status: string;
  readonly data: { readonly extraction: FileExtractionResponse };
}

interface ApiBatchStartResponse {
  readonly status: string;
  readonly data: BatchExtractionStartResponse;
}

export const extractionKeys = {
  all: ['extractions'] as const,
  lists: () => [...extractionKeys.all, 'list'] as const,
  list: (companyId: string) => [...extractionKeys.lists(), companyId] as const,
  archive: (query: FileExtractionListQuery) => [...extractionKeys.lists(), 'archive', query] as const,
  categorySummaries: () => [...extractionKeys.all, 'category-summary'] as const,
  categorySummary: (companyId?: string) =>
    [...extractionKeys.categorySummaries(), companyId ?? 'all'] as const,
  details: () => [...extractionKeys.all, 'detail'] as const,
  detail: (id: string) => [...extractionKeys.details(), id] as const,
};

function buildListParams(query: FileExtractionListQuery): Record<string, string> {
  return {
    page: String(query.page),
    pageSize: String(query.pageSize),
    ...(query.includeGenerated !== undefined
      ? { includeGenerated: String(query.includeGenerated) }
      : {}),
    ...(query.companyId ? { companyId: query.companyId } : {}),
    ...(query.q ? { q: query.q } : {}),
    ...(query.fileNames && query.fileNames.length > 0
      ? { fileNames: query.fileNames.join(',') }
      : {}),
    ...(query.status && query.status.length > 0 ? { status: query.status.join(',') } : {}),
    ...(query.category && query.category.length > 0 ? { category: query.category.join(',') } : {}),
    ...(query.sortBy ? { sortBy: query.sortBy } : {}),
    ...(query.sortOrder ? { sortOrder: query.sortOrder } : {}),
    ...(query.updatedAtFrom ? { updatedAtFrom: query.updatedAtFrom } : {}),
    ...(query.updatedAtTo ? { updatedAtTo: query.updatedAtTo } : {}),
  };
}

export function useExtractionsList(query: FileExtractionListQuery, enabled = true) {
  return useQuery({
    queryKey: extractionKeys.archive(query),
    queryFn: () =>
      customFetch<ApiListResponse>({
        url: '/extractions',
        method: 'GET',
        params: buildListParams(query),
      }).then((response) => response.data),
    enabled,
  });
}

export function useExtractionCategorySummary(companyId?: string) {
  return useQuery({
    queryKey: extractionKeys.categorySummary(companyId),
    queryFn: () =>
      customFetch<ApiCategorySummaryResponse>({
        url: '/extractions/category-summary',
        method: 'GET',
        params: companyId ? { companyId } : undefined,
      }).then((response) => response.data.categories),
  });
}

/** POST /extractions/batch — upload files and start extractions. */
export function useExtractionsBatchUpload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) =>
      multipartFetch<ApiBatchStartResponse>('/extractions/batch', formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: extractionKeys.lists() });
    },
  });
}

export interface BatchUploadMultiResult {
  readonly succeeded: readonly ApiBatchStartResponse[];
  readonly failed: ReadonlyArray<{ readonly companyId: string; readonly error: Error }>;
}

export interface BatchUploadMultiVariables {
  readonly batches: readonly ExtractionBatch[];
  readonly onUploadProgress?: (percent: number) => void;
}

/** Fan-out POST /extractions/batch, one per companyId group. */
export function useExtractionsBatchUploadMulti() {
  const queryClient = useQueryClient();
  return useMutation<BatchUploadMultiResult, Error, BatchUploadMultiVariables>({
    mutationFn: async ({ batches, onUploadProgress }) => {
      const totalBytes = batches.reduce((acc, b) => acc + b.totalBytes, 0);
      const loadedPerBatch = new Array<number>(batches.length).fill(0);
      const reportProgress = onUploadProgress
        ? () => {
            if (totalBytes === 0) return;
            const loaded = loadedPerBatch.reduce((acc, n) => acc + n, 0);
            onUploadProgress(Math.min(100, Math.round((loaded / totalBytes) * 100)));
          }
        : undefined;
      const settled = await Promise.allSettled(
        batches.map((b, i) =>
          multipartFetch<ApiBatchStartResponse>('/extractions/batch', b.formData, {
            onUploadProgress: reportProgress
              ? (event) => {
                  loadedPerBatch[i] = event.loaded;
                  reportProgress();
                }
              : undefined,
          }),
        ),
      );
      const succeeded = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      const failed = settled.flatMap((r, i) =>
        r.status === 'rejected'
          ? [{ companyId: batches[i].companyId, error: r.reason as Error }]
          : [],
      );
      if (batches.length > 0 && failed.length === batches.length) {
        throw failed[0].error;
      }
      return { succeeded, failed };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: extractionKeys.lists() });
    },
  });
}

/** GET /extractions?companyId=X — list extractions for a company. */
export function useExtractionsByCompany(companyId: string | undefined) {
  const query = {
    companyId: companyId ?? '',
    page: 1,
    pageSize: 100,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  } as const;
  return useQuery({
    queryKey: extractionKeys.list(companyId ?? ''),
    queryFn: () =>
      customFetch<ApiListResponse>({
        url: '/extractions',
        method: 'GET',
        params: buildListParams(query),
      }).then((response) => response.data.extractions as FileExtractionResponse[]),
    enabled: !!companyId,
  });
}
/** GET /extractions/:id — single extraction detail. */
export function useExtraction(id: string | undefined) {
  return useQuery({
    queryKey: extractionKeys.detail(id ?? ''),
    queryFn: () =>
      customFetch<ApiDetailResponse>({
        url: `/extractions/${id}`,
        method: 'GET',
      }).then((r) => r.data.extraction),
    refetchInterval: (query) =>
      query.state.data?.status === 'LOADING' ? 3000 : false,
    enabled: !!id,
  });
}
/** PATCH /extractions/:id — edit extracted data. */
export function useUpdateExtraction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, extractedData }: { id: string; extractedData: unknown }) =>
      customFetch<ApiDetailResponse>({
        url: `/extractions/${id}`,
        method: 'PATCH',
        data: { extractedData },
      }),
    onSuccess: (response, variables) => {
      queryClient.setQueryData(
        extractionKeys.detail(variables.id),
        response.data.extraction,
      );
      queryClient.invalidateQueries({
        queryKey: extractionKeys.lists(),
      });
      toast.success('Revisione salvata');
    },
    onError: (error: unknown) => {
      toast.error('Salvataggio revisione non riuscito', {
        description: formatMutationError(error, 'Errore durante il salvataggio'),
      });
    },
  });
}
/** POST /extractions/:id/confirm — confirm single extraction. */
export function useConfirmExtraction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload?: ConfirmExtractionPayload }) =>
      customFetch<unknown>({
        url: `/extractions/${id}/confirm`,
        method: 'POST',
        data: payload,
      }),
    onSuccess: (_response, variables) => {
      queryClient.setQueryData<FileExtractionResponse>(
        extractionKeys.detail(variables.id),
        (current) => current ? { ...current, status: 'CONFIRMED' } : current,
      );
      queryClient.invalidateQueries({ queryKey: extractionKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: extractionKeys.lists() });
      queryClient.invalidateQueries({ queryKey: extractionKeys.categorySummaries() });
      // After confirm, invoice/stock data may have created or updated products; refresh products list.
      queryClient.invalidateQueries({ queryKey: ['/products/me'] });
    },
    onError: (error: unknown) => {
      toast.error('Conferma non riuscita', {
        description: formatMutationError(error, 'Errore durante la conferma'),
      });
    },
  });
}
/** POST /extractions/batch/:batchId/confirm — confirm entire batch. */
export function useConfirmBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) =>
      customFetch<unknown>({
        url: `/extractions/batch/${batchId}/confirm`,
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: extractionKeys.all });
      queryClient.invalidateQueries({ queryKey: ['/products/me'] });
    },
  });
}
/** DELETE /extractions/:id — delete extraction record. */
export function useDeleteExtraction() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string, RemoveExtractionsResult>({
    mutationFn: (id) =>
      customFetch<void>({
        url: `/extractions/${id}`,
        method: 'DELETE',
      }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: extractionKeys.lists() });
      return removeExtractionsFromCaches(queryClient, {
        fileIds: [],
        extractionIds: [id],
      });
    },
    onError: (_err, _id, ctx) => {
      if (ctx) restoreExtractionCaches(queryClient, ctx.snapshots);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: extractionKeys.lists() });
    },
  });
}
function formatMutationError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const code = error.body.code?.trim();
    const message = error.body.message?.trim() || error.message;
    return code ? `${message} (${code})` : message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
