import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  ExportFormatDropdown,
  type ExportFormatOption,
} from '@/components/molecules/export-format-dropdown';
import { cn } from '@/lib/utils';

export interface BulkAction {
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly title?: string;
  readonly variant?: 'default' | 'destructive' | 'outline' | 'ghost';
}

interface SelectionActionBarProps {
  readonly selectedCount: number;
  readonly actions: readonly BulkAction[];
  readonly exportOptions?: readonly ExportFormatOption[];
  readonly onDeselect: () => void;
  readonly selectedLabel?: string;
  readonly className?: string;
}

export function SelectionActionBar({
  selectedCount,
  actions,
  exportOptions = [],
  onDeselect,
  selectedLabel,
  className,
}: SelectionActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        'fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-3 rounded-lg border bg-background px-4 py-2.5 shadow-lg',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Checkbox checked={true} onCheckedChange={() => onDeselect()} />
        <span className="text-sm font-medium">
          {selectedLabel ??
            `${selectedCount} element${selectedCount === 1 ? 'o' : 'i'} selezionat${selectedCount === 1 ? 'o' : 'i'}`}
        </span>
      </div>

      <Separator orientation="vertical" className="h-5" />

      <div className="flex items-center gap-1">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant={action.variant ?? 'ghost'}
            size="sm"
            className="h-8 gap-1.5 text-sm"
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.title}
          >
            {action.icon}
            {action.label}
          </Button>
        ))}

        {exportOptions.length > 0 && (
          <ExportFormatDropdown options={exportOptions} triggerLabel="Esporta" />
        )}
      </div>
    </div>
  );
}
