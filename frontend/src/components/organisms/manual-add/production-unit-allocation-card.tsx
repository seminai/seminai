import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface AllocationDragData {
  readonly unitIndex: number;
  readonly allocIndex: number;
}

interface ProductionUnitAllocationCardProps {
  readonly id: string;
  readonly fieldName: string;
  readonly areaHa: number;
  readonly data: AllocationDragData;
  readonly disabled?: boolean;
}

export function ProductionUnitAllocationCard({
  id,
  fieldName,
  areaHa,
  data,
  disabled,
}: ProductionUnitAllocationCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data,
    disabled,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border bg-background p-2 text-sm shadow-sm"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground disabled:cursor-not-allowed"
        aria-label="Trascina allocazione"
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{fieldName || 'Campo non selezionato'}</span>
        <span className="text-xs text-muted-foreground">{areaHa} ha</span>
      </div>
    </div>
  );
}
