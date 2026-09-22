import { InfoTooltip } from '@/components/atoms/info-tooltip';
import { Button } from '@/components/ui/button';
import { VerificationStatusLegend } from '@/components/molecules/verification-status-legend';
import { formatDateForView } from './mappers';

/** Compact legend shown above the operations table. */
export function OperationsStatusHeader(): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5 border-b px-3 py-1.5 text-[0.7rem] text-muted-foreground sm:px-4 sm:text-xs">
      <span>Stato verifica</span>
      <InfoTooltip title="Legenda stato verifica">
        <VerificationStatusLegend />
      </InfoTooltip>
    </div>
  );
}

interface OperationsSelectionFooterProps {
  readonly selectedCount: number;
  readonly hasUnsavedChanges: boolean;
  readonly isSaving: boolean;
  readonly onSave: () => Promise<void>;
  readonly onBulkVerifySelected: () => Promise<void>;
}

/** Actions and aggregate state shown below the operations table. */
export function OperationsSelectionFooter({
  selectedCount,
  hasUnsavedChanges,
  isSaving,
  onSave,
  onBulkVerifySelected,
}: OperationsSelectionFooterProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="text-[0.7rem] text-muted-foreground sm:text-xs">
        Selezionate: {selectedCount} — Ultimo aggiornamento tabella:{' '}
        {formatDateForView(new Date().toISOString())}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {selectedCount > 1 ? (
          <Button size="sm" variant="outline" onClick={onBulkVerifySelected} disabled={isSaving}>
            Verifica selezionate
          </Button>
        ) : null}
        {hasUnsavedChanges ? (
          <Button size="sm" onClick={onSave} disabled={isSaving}>
            Salva
          </Button>
        ) : null}
      </div>
    </div>
  );
}
