import { Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormFieldRow } from '@/components/atoms/form-field-row';
import type { WorkingAllocationRow } from '@/components/organisms/manual-add/production-units-wizard-types';

interface AllocationRowEditorProps {
  readonly row: WorkingAllocationRow;
  readonly maxCapacity: number;
  readonly disabled?: boolean;
  readonly onAreaChange: (areaHa: number) => void;
  readonly onMax: () => void;
  readonly onRemove: () => void;
}

export function AllocationRowEditor({
  row,
  maxCapacity,
  disabled,
  onAreaChange,
  onMax,
  onRemove,
}: AllocationRowEditorProps) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{row.fieldName}</p>
          <Badge variant="outline" className="mt-1">
            Disp. {maxCapacity.toLocaleString('it-IT')} ha
          </Badge>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          onClick={onRemove}
          aria-label="Rimuovi allocazione"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <FormFieldRow id={`alloc-${row.fieldId}`} label="Area (ha)">
            <Input
              id={`alloc-${row.fieldId}`}
              type="number"
              min={0}
              max={maxCapacity}
              step="0.01"
              value={String(row.areaHa)}
              disabled={disabled}
              onChange={(event) => onAreaChange(Number(event.target.value))}
            />
          </FormFieldRow>
        </div>
        <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={onMax}>
          Max
        </Button>
      </div>
    </div>
  );
}
