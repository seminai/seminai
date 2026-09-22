import { useMemo, useState } from 'react';
import { Check, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDebounce } from '@/hooks/use-debounce';
import { useGetProductsMinistrySearch } from '@/generated/api/products/products';
import { cn } from '@/lib/utils';

export interface MinistryPick {
  readonly ministryId: string;
  readonly name: string;
  readonly registrationNumber?: string;
  readonly activeIngredient?: string;
  readonly type?: string;
}

interface MinistryProductPickerProps {
  readonly selectedMinistryId?: string;
  readonly onSelect: (pick: MinistryPick) => void;
  readonly disabled?: boolean;
}

interface MinistryItem {
  readonly id: string;
  readonly name: string;
  readonly registrationNumber?: string;
  readonly activeIngredient?: string;
  readonly type?: string;
  readonly status?: string;
  readonly isRevoked: boolean;
}

export function MinistryProductPicker({
  selectedMinistryId,
  onSelect,
  disabled,
}: MinistryProductPickerProps) {
  const [nameFilter, setNameFilter] = useState('');
  const [activeIngredientFilter, setActiveIngredientFilter] = useState('');
  const debouncedName = useDebounce(nameFilter, 300);
  const debouncedActive = useDebounce(activeIngredientFilter, 300);
  const hasQuery = debouncedName.trim().length >= 2 || debouncedActive.trim().length >= 2;

  const { data, isLoading } = useGetProductsMinistrySearch(
    {
      name: debouncedName.trim() || undefined,
      activeIngredient: debouncedActive.trim() || undefined,
      limit: 50,
    },
    { query: { enabled: hasQuery } },
  );

  const items = useMemo(() => normalizeMinistryItems(data), [data]);

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="ministry-name">Nome prodotto</Label>
          <Input
            id="ministry-name"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="es. Bismark"
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ministry-active">Principio attivo</Label>
          <Input
            id="ministry-active"
            value={activeIngredientFilter}
            onChange={(e) => setActiveIngredientFilter(e.target.value)}
            placeholder="es. Glifosate"
            disabled={disabled}
          />
        </div>
      </div>

      {!hasQuery && (
        <p className="text-xs text-muted-foreground">
          Inserisci almeno 2 caratteri per cercare nel registro ministeriale.
        </p>
      )}

      {hasQuery && isLoading && (
        <p className="text-xs text-muted-foreground">Ricerca in corso...</p>
      )}

      {hasQuery && !isLoading && items.length === 0 && (
        <p className="text-xs text-muted-foreground">Nessun fitofarmaco trovato.</p>
      )}

      {items.length > 0 && (
        <ul className="max-h-72 divide-y overflow-y-auto rounded border bg-card">
          {items.map((item) => {
            const isSelected = item.id === selectedMinistryId;
            const isDisabled = disabled || item.isRevoked;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-xs transition-colors',
                    isDisabled
                      ? 'cursor-not-allowed bg-muted/40 text-muted-foreground'
                      : 'hover:bg-accent',
                    isSelected && !isDisabled && 'bg-primary/10',
                  )}
                  onClick={() => {
                    if (isDisabled) return;
                    onSelect({
                      ministryId: item.id,
                      name: item.name,
                      registrationNumber: item.registrationNumber,
                      activeIngredient: item.activeIngredient,
                      type: item.type,
                    });
                  }}
                  disabled={isDisabled}
                  aria-disabled={isDisabled}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.name}</span>
                      {item.isRevoked && (
                        <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-destructive">
                          <AlertCircle className="h-3 w-3" />
                          {item.status ?? 'Revocato'}
                        </span>
                      )}
                    </div>
                    {item.activeIngredient && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {item.activeIngredient}
                      </p>
                    )}
                    {item.registrationNumber && (
                      <p className="text-[11px] text-muted-foreground">
                        Reg. n. {item.registrationNumber}
                      </p>
                    )}
                  </div>
                  {isSelected && !isDisabled && (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function normalizeMinistryItems(raw: unknown): MinistryItem[] {
  const list = pickProductList(raw);
  const out: MinistryItem[] = [];
  const seen = new Set<string>();
  for (const obj of list) {
    const id = String(obj.id ?? obj.ministryId ?? obj.registrationNumber ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = String(obj.name ?? obj.productName ?? '').trim();
    if (!name) continue;
    const registrationNumber = readString(obj.registrationNumber);
    const activeIngredient = readString(obj.activeIngredient ?? obj.principioAttivo);
    const type = readString(obj.type ?? obj.tipo ?? obj.formulazione);
    const status = readString(obj.administrativeStatus ?? obj.status ?? obj.stato);
    const revokedFlag =
      obj.revoked === true ||
      obj.isRevoked === true ||
      (status ? status.toLowerCase().startsWith('revocato') : false);
    out.push({
      id,
      name,
      registrationNumber,
      activeIngredient,
      type,
      status,
      isRevoked: revokedFlag,
    });
  }
  return out;
}

function pickProductList(raw: unknown): Array<Record<string, unknown>> {
  const candidates: unknown[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      let allLookLikeProducts = true;
      for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
          allLookLikeProducts = false;
          break;
        }
        const e = entry as Record<string, unknown>;
        if (typeof e.name !== 'string' && typeof e.productName !== 'string') {
          allLookLikeProducts = false;
          break;
        }
      }
      if (allLookLikeProducts && value.length > 0) {
        candidates.push(...value);
      } else {
        value.forEach(visit);
      }
      return;
    }
    Object.values(value as Record<string, unknown>).forEach(visit);
  };
  visit(raw);
  return candidates.filter(
    (c): c is Record<string, unknown> => !!c && typeof c === 'object' && !Array.isArray(c),
  );
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
