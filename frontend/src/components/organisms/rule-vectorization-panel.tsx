import { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, RefreshCcw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetRulesIdQueryKey, useGetRulesId } from '@/generated/api/rules/rules';
import { Button } from '@/components/ui/button';
import { VectorizationStatusBadge } from '@/components/atoms/vectorization-status-badge';
import {
  useRetryRuleVectorization,
  useRuleChunks,
  type RuleChunkPreview,
} from '@/hooks/use-rule-vectorization';

interface Props {
  readonly ruleId: string;
  readonly hasPdf: boolean;
  readonly isVectorized: boolean;
  readonly vectorizedAt: string | null;
  readonly vectorizationError: string | null;
}

const POLL_INTERVAL_MS = 3000;
const PREVIEW_LIMIT = 5;

/**
 * Shows the current vectorization state for a rule's PDF, polls during pending,
 * exposes a retry button on error, and offers an on-demand chunk preview.
 */
export function RuleVectorizationPanel({
  ruleId,
  hasPdf,
  isVectorized,
  vectorizedAt,
  vectorizationError,
}: Props) {
  const queryClient = useQueryClient();
  const isPending = hasPdf && !isVectorized && !vectorizationError;
  const [previewOpen, setPreviewOpen] = useState(false);

  useGetRulesId(ruleId, {
    query: { enabled: isPending, refetchInterval: isPending ? POLL_INTERVAL_MS : false },
  });

  const retryMutation = useRetryRuleVectorization();
  const chunksQuery = useRuleChunks(ruleId, {
    limit: PREVIEW_LIMIT,
    enabled: previewOpen && isVectorized,
  });

  if (!hasPdf) return null;

  const handleRetry = () => {
    retryMutation.mutate(ruleId, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getGetRulesIdQueryKey(ruleId) });
      },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <VectorizationStatusBadge
          isVectorized={isVectorized}
          vectorizedAt={vectorizedAt}
          vectorizationError={vectorizationError}
          hasPdf={hasPdf}
        />
        {vectorizationError ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRetry}
            disabled={retryMutation.isPending}
          >
            {retryMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCcw className="size-3.5" />
            )}
            Riprova
          </Button>
        ) : null}
      </div>

      {vectorizationError ? (
        <p className="text-xs text-destructive wrap-break-word">{vectorizationError}</p>
      ) : null}

      {isVectorized ? (
        <div className="space-y-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPreviewOpen((v) => !v)}
            className="px-0"
          >
            {previewOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            Anteprima estratto PDF
          </Button>
          {previewOpen ? <ChunksPreview query={chunksQuery} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function ChunksPreview({
  query,
}: {
  readonly query: ReturnType<typeof useRuleChunks>;
}) {
  if (query.isLoading) {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="size-3.5 animate-spin" /> Caricamento anteprima…
      </div>
    );
  }
  if (query.isError) {
    return <div className="text-xs text-destructive">Impossibile caricare l'anteprima.</div>;
  }
  const chunks = query.data?.chunks ?? [];
  if (chunks.length === 0) {
    return <div className="text-xs text-muted-foreground">Nessun chunk disponibile.</div>;
  }
  return (
    <ul className="space-y-2">
      {chunks.map((c) => (
        <li key={c.chunkIndex}>
          <ChunkPreviewItem chunk={c} />
        </li>
      ))}
    </ul>
  );
}

function ChunkPreviewItem({ chunk }: { readonly chunk: RuleChunkPreview }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2.5 py-2 space-y-1 text-xs">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span>Chunk #{chunk.chunkIndex}</span>
        {chunk.chunkType ? <span>Tipo: {chunk.chunkType}</span> : null}
        {typeof chunk.page === 'number' ? <span>Pagina {chunk.page}</span> : null}
        {chunk.sectionName ? <span className="truncate">Sez: {chunk.sectionName}</span> : null}
      </div>
      <p className="leading-snug whitespace-pre-wrap wrap-break-word line-clamp-6">
        {chunk.content}
      </p>
    </div>
  );
}
