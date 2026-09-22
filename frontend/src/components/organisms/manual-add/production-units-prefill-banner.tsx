import { AlertTriangle, FileSearch, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {
  ExtractionPrefillStatus,
  PendingExtractionInfo,
} from '@/hooks/use-extraction-to-form-values';

interface ProductionUnitsPrefillBannerProps {
  readonly status: ExtractionPrefillStatus;
  readonly draftsCount: number;
  readonly pending: readonly PendingExtractionInfo[];
  readonly errors: readonly string[];
  readonly onClearPrefill: () => void;
  readonly emptyAllocationsCount?: number;
}

export function ProductionUnitsPrefillBanner({
  status,
  draftsCount,
  pending,
  errors,
  onClearPrefill,
  emptyAllocationsCount = 0,
}: ProductionUnitsPrefillBannerProps) {
  if (status === 'idle') return null;

  if (status === 'loading') {
    return (
      <BannerShell
        tone="info"
        icon={<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        title="Estrazione in corso..."
        description={
          pending.length > 0
            ? `Attendi che l'estrazione finisca per ${pending.length} ${pending.length === 1 ? 'file' : 'file'}.`
            : 'Attendiamo i risultati dell\'estrazione.'
        }
        onClearPrefill={onClearPrefill}
      >
        {pending.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            {pending.map((entry) => (
              <li key={entry.id}>
                {entry.fileName ?? entry.id} · {entry.status.toLowerCase()}
              </li>
            ))}
          </ul>
        )}
      </BannerShell>
    );
  }

  if (status === 'ready') {
    return (
      <BannerShell
        tone="success"
        icon={<FileSearch className="h-4 w-4 text-emerald-700" />}
        title={`Pre-compilato da ${draftsCount} ${draftsCount === 1 ? 'unità estratta' : 'unità estratte'}`}
        description="Rivedi i dati, completa i campi mancanti e poi conferma."
        onClearPrefill={onClearPrefill}
      >
        {emptyAllocationsCount > 0 && (
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            {emptyAllocationsCount}{' '}
            {emptyAllocationsCount === 1 ? 'unità ha allocazioni' : 'unità hanno allocazioni'}{' '}
            incomplete o duplicate: collega ogni campo prima di confermare.
          </p>
        )}
      </BannerShell>
    );
  }

  if (status === 'wrong-category') {
    return (
      <BannerShell
        tone="warning"
        icon={<AlertTriangle className="h-4 w-4 text-amber-700" />}
        title="L'estrazione non contiene Unità Produttive"
        description="Apri l'archivio per revisionare manualmente i file caricati."
        onClearPrefill={onClearPrefill}
      />
    );
  }

  // status === 'error'
  return (
    <BannerShell
      tone="destructive"
      icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
      title="Estrazione fallita"
      description={
        errors.length > 0
          ? `Errore su: ${errors.join(', ')}`
          : 'Una o più estrazioni hanno fallito.'
      }
      onClearPrefill={onClearPrefill}
    />
  );
}

interface BannerShellProps {
  readonly tone: 'info' | 'success' | 'warning' | 'destructive';
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly description: string;
  readonly children?: React.ReactNode;
  readonly onClearPrefill: () => void;
}

const TONE_CLASSES: Record<BannerShellProps['tone'], string> = {
  info: 'border-muted bg-muted/30 text-foreground',
  success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  destructive: 'border-destructive/40 bg-destructive/10 text-destructive',
};

function BannerShell({ tone, icon, title, description, children, onClearPrefill }: BannerShellProps) {
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${TONE_CLASSES[tone]}`}>
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-xs opacity-80">{description}</p>
        {children}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onClearPrefill}
        aria-label="Annulla prefill"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
