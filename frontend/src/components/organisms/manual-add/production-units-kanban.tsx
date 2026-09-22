import { useMemo } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useCompanyFields } from '@/components/organisms/manual-add/use-company-fields';
import { ProductionUnitAllocationCard } from '@/components/organisms/manual-add/production-unit-allocation-card';
import type {
  FieldAllocation,
  ProductionUnitDraft,
} from '@/components/organisms/manual-add/production-units-wizard-types';

interface ProductionUnitsKanbanProps {
  readonly units: readonly ProductionUnitDraft[];
  readonly companyId: string;
  readonly disabled?: boolean;
  readonly onUnitsChange: (units: ProductionUnitDraft[]) => void;
}

interface DragData {
  readonly unitIndex: number;
  readonly allocIndex: number;
}

const allocId = (unitIndex: number, allocIndex: number): string =>
  `alloc-${unitIndex}-${allocIndex}`;

const columnId = (unitIndex: number): string => `column-${unitIndex}`;

function readDragData(value: unknown): DragData | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  if (typeof obj.unitIndex === 'number' && typeof obj.allocIndex === 'number') {
    return { unitIndex: obj.unitIndex, allocIndex: obj.allocIndex };
  }
  return undefined;
}

function readColumnIndex(value: unknown): number | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  if (typeof obj.unitIndex === 'number' && obj.kind === 'column') return obj.unitIndex;
  return undefined;
}

export function ProductionUnitsKanban({
  units,
  companyId,
  disabled,
  onUnitsChange,
}: ProductionUnitsKanbanProps) {
  const { getFieldName } = useCompanyFields(companyId);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const columns = useMemo(
    () =>
      units.map((unit, unitIndex) => ({
        unitIndex,
        name: unit.name || `Unità produttiva ${unitIndex + 1}`,
        crop: unit.cropName,
        allocations: unit.allocations,
        itemIds: unit.allocations.map((_, allocIndex) => allocId(unitIndex, allocIndex)),
      })),
    [units],
  );

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over) return;
    const from = readDragData(active.data.current);
    if (!from) return;

    const overData = readDragData(over.data.current);
    const overColumn = readColumnIndex(over.data.current);
    const toUnitIndex = overData?.unitIndex ?? overColumn;
    if (toUnitIndex === undefined) return;

    const nextUnits = units.map((unit) => ({
      ...unit,
      allocations: [...unit.allocations],
    }));
    const fromAllocs = [...nextUnits[from.unitIndex].allocations];

    if (toUnitIndex === from.unitIndex) {
      if (overData === undefined) return;
      if (overData.allocIndex === from.allocIndex) return;
      const reordered = arrayMove(fromAllocs, from.allocIndex, overData.allocIndex);
      nextUnits[from.unitIndex] = { ...nextUnits[from.unitIndex], allocations: reordered };
      onUnitsChange(nextUnits);
      return;
    }

    const [moved] = fromAllocs.splice(from.allocIndex, 1);
    if (!moved) return;
    const toAllocsBase = [...nextUnits[toUnitIndex].allocations];
    const insertAt = overData ? overData.allocIndex : toAllocsBase.length;
    const toAllocs: FieldAllocation[] = [
      ...toAllocsBase.slice(0, insertAt),
      moved,
      ...toAllocsBase.slice(insertAt),
    ];

    nextUnits[from.unitIndex] = { ...nextUnits[from.unitIndex], allocations: fromAllocs };
    nextUnits[toUnitIndex] = { ...nextUnits[toUnitIndex], allocations: toAllocs };
    onUnitsChange(nextUnits);
  };

  if (!companyId) {
    return (
      <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Seleziona prima l&apos;azienda per visualizzare il Kanban.
      </p>
    );
  }

  if (units.length === 0) {
    return (
      <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Nessuna unità produttiva da organizzare.
      </p>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((column) => (
          <KanbanColumn
            key={column.unitIndex}
            unitIndex={column.unitIndex}
            name={column.name}
            crop={column.crop}
            itemIds={column.itemIds}
            allocations={column.allocations}
            getFieldName={getFieldName}
            disabled={disabled}
          />
        ))}
      </div>
    </DndContext>
  );
}

interface KanbanColumnProps {
  readonly unitIndex: number;
  readonly name: string;
  readonly crop: string;
  readonly itemIds: readonly string[];
  readonly allocations: readonly FieldAllocation[];
  readonly getFieldName: (id: string) => string;
  readonly disabled?: boolean;
}

function KanbanColumn({
  unitIndex,
  name,
  crop,
  itemIds,
  allocations,
  getFieldName,
  disabled,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnId(unitIndex),
    data: { kind: 'column', unitIndex },
    disabled,
  });

  return (
    <div className="flex min-w-[240px] flex-shrink-0 flex-col rounded-lg border bg-card">
      <div className="border-b p-3">
        <h3 className="truncate text-sm font-semibold">{name}</h3>
        {crop ? <p className="truncate text-xs text-muted-foreground">{crop}</p> : null}
        <p className="mt-1 text-xs text-muted-foreground">
          {allocations.length} {allocations.length === 1 ? 'parcella' : 'parcelle'}
        </p>
      </div>
      <SortableContext items={[...itemIds]} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`flex min-h-[80px] flex-col gap-2 p-3 ${isOver ? 'bg-muted/40' : ''}`}
        >
          {allocations.map((alloc, allocIndex) => (
            <ProductionUnitAllocationCard
              key={itemIds[allocIndex]}
              id={itemIds[allocIndex]}
              fieldName={alloc.fieldName ?? getFieldName(alloc.fieldId)}
              areaHa={alloc.areaHa}
              data={{ unitIndex, allocIndex }}
              disabled={disabled}
            />
          ))}
          {allocations.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground">Trascina qui</p>
          ) : null}
        </div>
      </SortableContext>
    </div>
  );
}
