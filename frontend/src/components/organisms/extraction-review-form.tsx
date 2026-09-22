import { useMemo, useState } from 'react';
import { ExternalLink, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { Link, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { DocumentBadge } from '@/components/atoms/document-badge';
import { ExtractionReviewField } from '@/components/molecules/extraction-review-field';
import {
  useExtractionReviewCancel,
  useExtractionReviewCommit,
} from '@/hooks/use-extraction-review';
import type { ExtractionReviewPayload } from '@/lib/agent-chat-events';
import type { ExtractionReviewStatus } from '@/types/chat-stream';

interface ExtractionReviewFormProps {
  readonly payload: ExtractionReviewPayload;
  readonly status: ExtractionReviewStatus;
}

function isMissing(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  return false;
}

function extractIdFromArchiveUrl(url: string): string | null {
  const match = url.match(/\/archivio\/([0-9a-f-]+)/i);
  return match ? match[1] : null;
}

export function ExtractionReviewForm({ payload, status }: ExtractionReviewFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>(payload.data ?? {});
  const [error, setError] = useState<string | null>(null);
  const [archivedUrl, setArchivedUrl] = useState<string | null>(null);
  const [archivedId, setArchivedId] = useState<string | null>(null);
  const commitMutation = useExtractionReviewCommit();
  const cancelMutation = useExtractionReviewCancel();
  const navigate = useNavigate();

  const requiredMissing = useMemo(
    () => payload.fields.filter((f) => f.required && isMissing(values[f.key])).map((f) => f.labelIt),
    [payload.fields, values],
  );

  const isReadOnly = status !== 'editing';

  function handleFieldChange(key: string, value: unknown): void {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(): Promise<void> {
    setError(null);
    if (requiredMissing.length > 0) {
      setError(`Compila i campi obbligatori: ${requiredMissing.join(', ')}`);
      return;
    }
    try {
      const result = await commitMutation.mutateAsync({ reviewId: payload.reviewId, data: values });
      const archiveUrl = result.data.archiveUrl;
      const pageId = extractIdFromArchiveUrl(archiveUrl);
      setArchivedUrl(archiveUrl);
      setArchivedId(pageId);
      toast.success('Documento salvato in archivio', {
        description: `${result.data.fileName} pronto per la conferma definitiva`,
        action: pageId
          ? {
              label: 'Apri scheda',
              onClick: () => {
                void navigate({ to: '/archivio/$pageId', params: { pageId } });
              },
            }
          : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salvataggio fallito.');
    }
  }

  async function handleCancel(): Promise<void> {
    setError(null);
    try {
      await cancelMutation.mutateAsync({ reviewId: payload.reviewId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Annullamento fallito.');
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
      <div className="flex items-center gap-2">
        <DocumentBadge category={payload.category} />
        <span className="truncate text-xs text-muted-foreground">{payload.fileName}</span>
        {payload.fileUrl && (
          <a
            href={payload.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-[11px] text-blue-700 hover:underline dark:text-blue-300"
          >
            Apri documento
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {payload.fields.map((field) => (
          <ExtractionReviewField
            key={field.key}
            descriptor={field}
            value={values[field.key]}
            onChange={(value) => handleFieldChange(field.key, value)}
            disabled={isReadOnly || commitMutation.isPending || cancelMutation.isPending}
          />
        ))}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {status === 'saved' && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
          <span>Documento salvato in archivio.</span>
          {archivedId ? (
            <Link
              to="/archivio/$pageId"
              params={{ pageId: archivedId }}
              className="inline-flex items-center gap-1 underline"
            >
              Apri scheda
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : archivedUrl ? (
            <a
              href={archivedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline"
            >
              Apri archivio
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      )}
      {status === 'cancelled' && (
        <p className="text-xs text-muted-foreground">Revisione annullata.</p>
      )}
      {status === 'editing' && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={() => void handleSave()}
            disabled={commitMutation.isPending || cancelMutation.isPending}
          >
            <Save className="mr-1.5 h-3 w-3" />
            {commitMutation.isPending ? 'Salvataggio...' : 'Salva'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleCancel()}
            disabled={commitMutation.isPending || cancelMutation.isPending}
          >
            <X className="mr-1.5 h-3 w-3" />
            Annulla
          </Button>
        </div>
      )}
    </div>
  );
}
