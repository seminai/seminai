import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface EditableExtractionColumn {
  readonly id: string;
  readonly label: string;
  readonly defaultVisible?: boolean;
  readonly readOnly?: boolean;
}

interface EditableExtractionColumnMenuProps {
  readonly columns: readonly EditableExtractionColumn[];
  readonly visibleColumnIds: readonly string[];
  readonly onVisibleColumnIdsChange: (columnIds: readonly string[]) => void;
}

export function EditableExtractionColumnMenu({
  columns,
  visibleColumnIds,
  onVisibleColumnIdsChange,
}: EditableExtractionColumnMenuProps) {
  const visibleIds = new Set(visibleColumnIds);

  function toggleColumn(columnId: string, checked: boolean): void {
    if (checked) {
      onVisibleColumnIdsChange([...visibleColumnIds, columnId]);
      return;
    }
    onVisibleColumnIdsChange(visibleColumnIds.filter((id) => id !== columnId));
  }

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" className="h-8 gap-1.5" />}>
        <Settings2 className="h-4 w-4" />
        Visualizza
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="end">
        <div className="px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">Colonne visibili</p>
        </div>
        <div className="max-h-64 overflow-y-auto border-t py-1">
          {columns.map((column) => (
            <label key={column.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent">
              <span className="flex-1">{column.label}</span>
              <Checkbox
                checked={visibleIds.has(column.id)}
                onCheckedChange={(checked) => toggleColumn(column.id, checked === true)}
              />
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
