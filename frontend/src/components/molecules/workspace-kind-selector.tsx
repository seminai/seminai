import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import {
  WORKSPACE_KIND_LABELS,
  type WorkspaceKind,
} from '@/types/workspace';

const WORKSPACE_KIND_OPTIONS: readonly {
  readonly value: WorkspaceKind;
  readonly title: string;
  readonly description: string;
}[] = [
  {
    value: 'AGRICULTURAL',
    title: WORKSPACE_KIND_LABELS.AGRICULTURAL,
    description: 'Chat agronomica per dosaggi, appezzamenti e documenti DCA.',
  },
  {
    value: 'MANUFACTURING',
    title: WORKSPACE_KIND_LABELS.MANUFACTURING,
    description: 'Agente dedicato alla produzione e archivio magazzino/prodotti.',
  },
];

interface WorkspaceKindSelectorProps {
  readonly value: WorkspaceKind;
  readonly onChange: (kind: WorkspaceKind) => void;
  readonly disabled?: boolean;
}

export function WorkspaceKindSelector({
  value,
  onChange,
  disabled,
}: WorkspaceKindSelectorProps) {
  return (
    <div className="space-y-2">
      <Label>Tipo workspace *</Label>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Tipo workspace">
        {WORKSPACE_KIND_OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors',
                selected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border hover:bg-muted/50',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <p className="text-sm font-medium">{option.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Il tipo determina l&apos;agente chat e le sezioni dell&apos;archivio disponibili. Non
        potrà essere modificato dopo la creazione.
      </p>
    </div>
  );
}
