import { Button } from '@/components/ui/button';

interface AllocationSummaryProps {
  readonly totalHa: number;
  readonly allocationCount: number;
}

export function AllocationSummary({
  totalHa,
  allocationCount,
}: AllocationSummaryProps): React.JSX.Element {
  return (
    <section className="rounded-lg border bg-muted/30 p-3 text-sm">
      <p>
        Superficie allocata: <strong>{totalHa.toLocaleString('it-IT')} ha</strong> su{' '}
        {allocationCount} {allocationCount === 1 ? 'campo' : 'campi'}
      </p>
    </section>
  );
}

interface DetailActionsProps {
  readonly disabled?: boolean;
  readonly onBack: () => void;
}

export function DetailActions({ disabled, onBack }: DetailActionsProps): React.JSX.Element {
  return (
    <div className="flex justify-between gap-2">
      <Button type="button" variant="outline" disabled={disabled} onClick={onBack}>
        Indietro
      </Button>
      <Button type="submit" disabled={disabled}>Salva unità</Button>
    </div>
  );
}
