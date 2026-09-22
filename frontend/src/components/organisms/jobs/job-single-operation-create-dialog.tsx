import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/molecules/searchable-select';
import { useCompanyOptions } from '@/hooks/use-company-options';
import { usePostJobsCreateProductAndJob } from '@/generated/api/jobs/jobs';
import { usePostProductionUnitsGetProductionUnitByCompanies } from '@/generated/api/production-units/production-units';
import { extractArray } from '@/lib/api-response';
import {
  useOperationProductOptions,
  type OperationProductOption,
} from './use-operation-product-options';

interface JobSingleOperationCreateDialogProps {
  readonly open: boolean;
  readonly groupJobId: string | null;
  readonly defaultCompanyId: string | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: () => Promise<void> | void;
}

interface ProductionUnitOption {
  readonly id: string;
  readonly name: string;
  readonly cropName: string;
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function toIsoFromDate(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

function toText(value: unknown): string {
  return String(value ?? '').trim();
}

function mapProductionUnits(raw: unknown): ProductionUnitOption[] {
  return extractArray(raw, 'productionUnits').map((item) => {
    const productionUnit = item.productionUnit as Record<string, unknown> | undefined;
    const crop = item.crop as Record<string, unknown> | undefined;
    const id = toText(productionUnit?.id);
    return {
      id,
      name: toText(productionUnit?.name) || id,
      cropName: toText(crop?.name),
    };
  }).filter((item) => item.id.length > 0);
}

function formatProductDescription(option: OperationProductOption): string {
  const source = option.source === 'warehouse' ? 'Magazzino' : 'Ministero';
  const stock = option.availableQuantity == null ? null : `${option.availableQuantity} ${option.unit}`;
  return [
    source,
    option.registrationNumber ? `Reg. ${option.registrationNumber}` : null,
    option.activeIngredient || null,
    stock ? `Stock ${stock}` : null,
  ].filter(Boolean).join(' | ');
}

export function JobSingleOperationCreateDialog({
  open,
  groupJobId,
  defaultCompanyId,
  onOpenChange,
  onCreated,
}: JobSingleOperationCreateDialogProps) {
  const { companies } = useCompanyOptions();
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? '');
  const [productId, setProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [date, setDate] = useState(todayInputValue());
  const [unitQuantities, setUnitQuantities] = useState<Readonly<Record<string, string>>>({});
  const productionUnitsQuery = usePostProductionUnitsGetProductionUnitByCompanies();
  const createMutation = usePostJobsCreateProductAndJob();
  const productOptionsState = useOperationProductOptions(companyId || null, productSearch);

  useEffect(() => {
    if (!open || !defaultCompanyId) return;
    setCompanyId(defaultCompanyId);
  }, [defaultCompanyId, open]);

  useEffect(() => {
    if (!open || !companyId) return;
    productionUnitsQuery.mutate({ data: { companyIds: [companyId] } });
    setProductId('');
    setUnitQuantities({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, open]);

  const productionUnits = useMemo(
    () => mapProductionUnits(productionUnitsQuery.data?.data),
    [productionUnitsQuery.data],
  );
  const selectedProduct = useMemo(
    () => productOptionsState.options.find((option) => option.id === productId) ?? null,
    [productId, productOptionsState.options],
  );
  const productSelectOptions = useMemo(
    () =>
      productOptionsState.options.map((option) => ({
        value: option.id,
        label: option.name,
        description: formatProductDescription(option),
        searchKeywords: [
          option.name,
          option.registrationNumber,
          option.activeIngredient,
          option.administrativeStatus,
          option.source,
        ].join(' '),
      })),
    [productOptionsState.options],
  );
  const selectedUnitIds = Object.entries(unitQuantities)
    .filter(([, quantity]) => Number.parseFloat(quantity) > 0)
    .map(([id]) => id);
  const canCreate = Boolean(groupJobId && companyId && selectedProduct && date && selectedUnitIds.length > 0);

  function toggleUnit(id: string, checked: boolean): void {
    setUnitQuantities((previous) => {
      if (checked) return { ...previous, [id]: previous[id] ?? '' };
      const next = { ...previous };
      delete next[id];
      return next;
    });
  }

  function updateQuantity(id: string, value: string): void {
    setUnitQuantities((previous) => ({ ...previous, [id]: value }));
  }

  async function handleCreate(): Promise<void> {
    if (!selectedProduct || !groupJobId) return;
    const data = selectedUnitIds.map((productionUnitId) => {
      const quantity = Number.parseFloat(unitQuantities[productionUnitId] ?? '0');
      const stockBase = {
        quantity,
        unitOfMeasureQuantity: selectedProduct.unit,
        price: 0,
        unitOfMeasurePrice: 'EUR',
        type: 'OUT',
      };
      return {
        jobId: groupJobId,
        productionUnitId,
        dateOfOpeation: toIsoFromDate(date),
        category: 'TREATMENT',
        quantity,
        unitOfMeasureQuantity: selectedProduct.unit,
        isVerified: false,
        conformityChecked: false,
        stocks: [
          selectedProduct.productId
            ? { ...stockBase, productId: selectedProduct.productId }
            : {
                ...stockBase,
                product: {
                  name: selectedProduct.name,
                  sku: `MIN-${selectedProduct.registrationNumber}`,
                  category: 'PESTICIDE',
                  type: 'Fitosanitario',
                  registrationNumber: selectedProduct.registrationNumber,
                  labelMetadata: { principio_attivo: selectedProduct.activeIngredient || null },
                },
              },
        ],
      };
    });
    await createMutation.mutateAsync({ data });
    await onCreated();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuova operazione singola</DialogTitle>
          <DialogDescription>
            Seleziona azienda, prodotto e unità produttive. La conformità partirà come non verificata.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Azienda</label>
            <SearchableSelect
              value={companyId}
              options={companies}
              placeholder="Seleziona azienda"
              searchPlaceholder="Cerca azienda..."
              emptyMessage="Nessuna azienda."
              onChange={(value) => setCompanyId(value ?? '')}
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prodotto</label>
            <SearchableSelect
              value={productId}
              options={productSelectOptions}
              placeholder={companyId ? 'Cerca prodotto...' : 'Seleziona prima una azienda'}
              searchPlaceholder="Nome, principio attivo o registrazione..."
              emptyMessage={productOptionsState.isLoading ? 'Caricamento...' : 'Nessun prodotto.'}
              disabled={!companyId}
              searchValue={productSearch}
              onSearchChange={setProductSearch}
              onChange={(value) => setProductId(value ?? '')}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Unità produttive e quantità
            </label>
            <div className="max-h-64 space-y-2 overflow-auto rounded-lg border p-2">
              {productionUnitsQuery.isPending ? (
                <p className="px-2 py-4 text-sm text-muted-foreground">Caricamento unità produttive...</p>
              ) : null}
              {!productionUnitsQuery.isPending && productionUnits.length === 0 ? (
                <p className="px-2 py-4 text-sm text-muted-foreground">Nessuna unità produttiva per questa azienda.</p>
              ) : null}
              {productionUnits.map((unit) => {
                const isSelected = unit.id in unitQuantities;
                return (
                  <div key={unit.id} className="grid gap-2 rounded-md border bg-card p-3 sm:grid-cols-[1fr_9rem]">
                    <label className="flex items-start gap-3">
                      <Checkbox checked={isSelected} onCheckedChange={(checked) => toggleUnit(unit.id, Boolean(checked))} />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{unit.name}</span>
                        {unit.cropName ? <span className="text-xs text-muted-foreground">{unit.cropName}</span> : null}
                      </span>
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={!isSelected}
                      placeholder="Quantità"
                      value={unitQuantities[unit.id] ?? ''}
                      onChange={(event) => updateQuantity(unit.id, event.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Data</label>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button disabled={!canCreate || createMutation.isPending} onClick={() => void handleCreate()}>
            {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Crea operazione
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
