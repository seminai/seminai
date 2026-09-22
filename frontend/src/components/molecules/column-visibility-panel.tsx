import type { Table } from '@tanstack/react-table';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { getSafeColumnLabel } from '@/lib/safe-display';
import { Settings2, GripVertical } from 'lucide-react';

interface ColumnVisibilityPanelProps<TData> {
  readonly table: Table<TData>;
  readonly columnLabels?: Record<string, string>;
}

export function ColumnVisibilityPanel<TData>({
  table,
  columnLabels = {},
}: ColumnVisibilityPanelProps<TData>) {
  const allColumns = table
    .getAllColumns()
    .filter((col) => col.getCanHide());

  return (
    <Popover>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className="h-9 gap-1.5" />}
      >
        <Settings2 className="h-4 w-4" />
        Visualizza
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <div className="px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">
            Colonne visibili
          </p>
        </div>

        <div className="max-h-64 overflow-y-auto border-t py-1">
          {allColumns.map((column) => {
            const label = getSafeColumnLabel(column.id, columnLabels);

            return (
              <label
                key={column.id}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
              >
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
                <span className="flex-1">{label}</span>
                <Checkbox
                  checked={column.getIsVisible()}
                  onCheckedChange={(checked) =>
                    column.toggleVisibility(!!checked)
                  }
                />
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
