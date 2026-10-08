import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Movement, Product } from '@/services/farm-api';
export function MovementFields({
  rows,
  products,
  defaultType,
  onChange,
}: {
  rows: Movement[];
  products: Product[];
  defaultType: 'IN' | 'OUT';
  onChange: (rows: Movement[]) => void;
}) {
  const update = (index: number, change: Partial<Movement>) =>
    onChange(rows.map((row, position) => (position === index ? { ...row, ...change } : row)));
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <fieldset key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium">Movimento {index + 1}</legend>
          <label className="text-sm">
            Prodotto e magazzino
            <select
              aria-label={`Prodotto ${index + 1}`}
              required
              className="h-10 w-full rounded-md border bg-background px-3"
              value={row.productId}
              onChange={(event) => update(index, { productId: event.target.value })}
            >
              <option value="">Seleziona</option>
              {products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.warehouse.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Operazione
            <select
              className="h-10 w-full rounded-md border bg-background px-3"
              value={row.type}
              onChange={(event) => update(index, { type: event.target.value as 'IN' | 'OUT' })}
            >
              <option value="IN">Carico</option>
              <option value="OUT">Scarico</option>
            </select>
          </label>
          <label className="text-sm">
            Quantità
            <Input
              aria-label={`Quantità ${index + 1}`}
              type="number"
              min="0.000001"
              step="any"
              required
              value={row.quantity || ''}
              onChange={(event) => update(index, { quantity: Number(event.target.value) })}
            />
          </label>
          <label className="text-sm">
            Unità
            <Input
              required
              value={row.unit}
              onChange={(event) => update(index, { unit: event.target.value })}
            />
          </label>
          <label className="text-sm">
            Riferimento documento
            <Input
              value={row.documentReference || ''}
              onChange={(event) => update(index, { documentReference: event.target.value })}
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange(rows.filter((_, position) => position !== index))}
          >
            Rimuovi movimento
          </Button>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={rows.length >= 100}
        onClick={() =>
          onChange([
            ...rows,
            { productId: '', type: defaultType, quantity: 0, unit: 'kg', price: 0 },
          ])
        }
      >
        Aggiungi prodotto
      </Button>
    </div>
  );
}
