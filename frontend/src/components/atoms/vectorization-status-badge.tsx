import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Props {
  readonly isVectorized: boolean | undefined;
  readonly vectorizedAt: string | null | undefined;
  readonly vectorizationError: string | null | undefined;
  readonly hasPdf: boolean;
}

/**
 * Visualizes the current vectorization state of a rule's PDF (pending/success/error).
 * Renders nothing when no PDF is associated with the rule.
 */
export function VectorizationStatusBadge({
  isVectorized,
  vectorizedAt,
  vectorizationError,
  hasPdf,
}: Props) {
  if (!hasPdf) return null;

  if (vectorizationError) {
    return (
      <Badge variant="destructive" className="gap-1.5" title={vectorizationError}>
        <AlertCircle className="size-3" />
        Errore vettorializzazione
      </Badge>
    );
  }

  if (isVectorized) {
    const formatted = vectorizedAt ? formatDate(vectorizedAt) : null;
    return (
      <Badge variant="secondary" className="gap-1.5" title={formatted ? `Vettorializzato ${formatted}` : undefined}>
        <CheckCircle2 className="size-3" />
        Vettorializzato
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1.5">
      <Loader2 className="size-3 animate-spin" />
      Vettorializzazione in corso…
    </Badge>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}
