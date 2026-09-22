import { useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/molecules/searchable-select';
import { useCompanyOptions } from '@/hooks/use-company-options';
import { usePostProductionUnitsGetProductionUnitByCompanies } from '@/generated/api/production-units/production-units';

interface ProductionUnitOption {
  readonly id: string;
  readonly name: string;
  readonly cropName: string;
  readonly companyName: string;
}

interface PlanningCompanySelectorProps {
  readonly mode: 'manual' | 'auto';
  readonly companyId: string | null;
  readonly productionUnitIds: readonly string[];
  readonly onCompanyChange: (companyId: string, companyName: string) => void;
  readonly onProductionUnitsChange: (ids: readonly string[]) => void;
  readonly onProductionUnitOptionsChange: (options: readonly ProductionUnitOption[]) => void;
  readonly onNext: () => void;
}

export function PlanningCompanySelector({
  mode,
  companyId,
  productionUnitIds,
  onCompanyChange,
  onProductionUnitsChange,
  onProductionUnitOptionsChange,
  onNext,
}: PlanningCompanySelectorProps) {
  const { companies } = useCompanyOptions();
  const fetchPUs = usePostProductionUnitsGetProductionUnitByCompanies();

  useEffect(() => {
    if (!companyId) return;
    fetchPUs.mutate({ data: { companyIds: [companyId] } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const productionUnits: readonly ProductionUnitOption[] = useMemo(() => {
    const responseBody = fetchPUs.data?.data as
      | { data?: { productionUnits?: readonly Record<string, unknown>[] } }
      | undefined;
    const items = responseBody?.data?.productionUnits ?? [];
    return items.map((item) => {
      const pu = item.productionUnit as Record<string, unknown> | undefined;
      const crop = item.crop as Record<string, unknown> | undefined;
      return {
        id: (pu?.id as string) ?? '',
        name: (pu?.name as string) ?? (pu?.id as string) ?? '',
        cropName: (crop?.name as string) ?? '',
        companyName: (item.companyName as string) ?? '',
      };
    });
  }, [fetchPUs.data]);

  useEffect(() => {
    onProductionUnitOptionsChange(productionUnits);
  }, [onProductionUnitOptionsChange, productionUnits]);

  // Auto-select all production units in automatic mode
  useEffect(() => {
    if (mode === 'auto' && productionUnits.length > 0 && productionUnitIds.length === 0) {
      onProductionUnitsChange(productionUnits.map((pu) => pu.id));
    }
  }, [mode, productionUnits, productionUnitIds.length, onProductionUnitsChange]);

  function toggleUnit(id: string) {
    if (productionUnitIds.includes(id)) {
      onProductionUnitsChange(productionUnitIds.filter((uid) => uid !== id));
    } else {
      onProductionUnitsChange([...productionUnitIds, id]);
    }
  }

  function toggleAll() {
    if (productionUnitIds.length === productionUnits.length) {
      onProductionUnitsChange([]);
    } else {
      onProductionUnitsChange(productionUnits.map((pu) => pu.id));
    }
  }

  const canAdvance = Boolean(companyId) && productionUnitIds.length > 0;

  return (
    <div className="mx-auto max-w-md px-6 py-8">
      <div className="flex flex-col gap-6">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Azienda
          </label>
          <SearchableSelect
            value={companyId ?? ''}
            options={companies}
            placeholder="Seleziona un'azienda"
            searchPlaceholder="Cerca azienda..."
            emptyMessage="Nessuna azienda trovata."
            onChange={(value) => {
              if (!value) return;
              const company = companies.find((c) => c.value === value);
              onCompanyChange(value, company?.label ?? value);
            }}
          />
        </div>

        {companyId && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Unita produttive
              </label>
              {productionUnits.length > 0 && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={toggleAll}
                >
                  {productionUnitIds.length === productionUnits.length
                    ? 'Deseleziona tutto'
                    : 'Seleziona tutto'}
                </button>
              )}
            </div>

            {fetchPUs.isPending && (
              <p className="text-sm text-muted-foreground">Caricamento...</p>
            )}

            {productionUnits.length > 0 && (
              <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                {productionUnits.map((pu) => (
                  <label
                    key={pu.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 hover:bg-accent/50"
                  >
                    <Checkbox
                      checked={productionUnitIds.includes(pu.id)}
                      onCheckedChange={() => toggleUnit(pu.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium">{pu.name}</span>
                      {pu.cropName && (
                        <span className="ml-2 text-xs text-muted-foreground">{pu.cropName}</span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {!fetchPUs.isPending && productionUnits.length === 0 && companyId && (
              <p className="text-sm text-muted-foreground">
                Nessuna unita produttiva trovata per questa azienda.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-8 flex justify-end">
        <Button disabled={!canAdvance} onClick={onNext}>
          Avanti
        </Button>
      </div>
    </div>
  );
}
