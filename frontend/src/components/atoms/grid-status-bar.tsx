import type { SelectionAggregates } from '@/hooks/use-selection-aggregates';

interface GridStatusBarProps {
  readonly aggregates: SelectionAggregates | null;
  readonly className?: string;
}

const numberFormat = new Intl.NumberFormat('it-IT', {
  maximumFractionDigits: 2,
});

/**
 * Displays count / sum / average for the currently selected numeric cells,
 * similar to Excel's status bar. Renders nothing when no numeric values
 * are selected.
 */
export function GridStatusBar({ aggregates, className }: GridStatusBarProps) {
  if (!aggregates) return null;

  return (
    <div
      className={`flex items-center gap-4 border-t px-3 py-1.5 text-xs text-muted-foreground ${className ?? ''}`}
    >
      <span>Conteggio: {aggregates.count}</span>
      <span>Somma: {numberFormat.format(aggregates.sum)}</span>
      <span>Media: {numberFormat.format(aggregates.average)}</span>
    </div>
  );
}
