import { Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { ManualPlanRow as ManualPlanRowType } from '@/types/planning';

interface ManualPlanRowProps {
  readonly row: ManualPlanRowType;
  readonly productionUnitOptions: readonly { readonly id: string; readonly name: string }[];
  readonly onUpdate: (updates: Partial<ManualPlanRowType>) => void;
  readonly onRemove: () => void;
}

export function ManualPlanRow({ row, productionUnitOptions, onUpdate, onRemove }: ManualPlanRowProps) {
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2">
      <div className="grid min-w-0 flex-1 grid-cols-5 gap-2">
        <Input
          placeholder="Prodotto"
          value={row.productName}
          onChange={(e) => onUpdate({ productName: e.target.value })}
        />
        <Input
          placeholder="N. registrazione"
          value={row.registrationNumber}
          onChange={(e) => onUpdate({ registrationNumber: e.target.value })}
        />
        <Input
          type="number"
          placeholder="Quantita"
          value={row.quantity || ''}
          onChange={(e) => onUpdate({ quantity: Number(e.target.value) || 0 })}
        />
        <Input
          type="date"
          value={row.date}
          onChange={(e) => onUpdate({ date: e.target.value })}
        />
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={row.productionUnitId ?? ''}
          onChange={(e) => onUpdate({ productionUnitId: e.target.value || undefined })}
        >
          <option value="">UP (opzionale)</option>
          {productionUnitOptions.map((pu) => (
            <option key={pu.id} value={pu.id}>
              {pu.name}
            </option>
          ))}
        </select>
      </div>
      <Button variant="ghost" size="icon-sm" onClick={onRemove}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}
