import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { FormFieldRow } from '@/components/atoms/form-field-row';
import { QuantityUnitSearchableSelect } from '@/components/atoms/quantity-unit-searchable-select';
import { PriceUnitSearchableSelect } from '@/components/atoms/price-unit-searchable-select';
import type { ProductRow, StockRow } from '@/components/organisms/manual-add/products-wizard-types';

interface ProductsWizardStepStockProps {
  readonly products: readonly ProductRow[];
  readonly stocks: readonly StockRow[];
  readonly includeStocks: boolean;
  readonly onToggleInclude: (next: boolean) => void;
  readonly onStocksChange: (next: StockRow[]) => void;
  readonly onBack: () => void;
  readonly onSubmit: () => void;
  readonly isSubmitting: boolean;
}

export function ProductsWizardStepStock({
  products,
  stocks,
  includeStocks,
  onToggleInclude,
  onStocksChange,
  onBack,
  onSubmit,
  isSubmitting,
}: ProductsWizardStepStockProps) {
  function updateStock(index: number, partial: Partial<StockRow>) {
    onStocksChange(stocks.map((row, i) => (i === index ? { ...row, ...partial } : row)));
  }

  const stocksValid =
    !includeStocks ||
    stocks.every(
      (row) =>
        row.quantity > 0 &&
        row.unitOfMeasureQuantity.trim().length > 0 &&
        (row.unitOfMeasurePrice?.trim().length ?? 0) > 0,
    );

  return (
    <div className="flex flex-col gap-4">
      <section className="flex items-center justify-between rounded-lg border bg-card p-4">
        <div>
          <Label htmlFor="include-stocks" className="cursor-pointer text-sm font-semibold">
            Aggiungi movimento di stock iniziale
          </Label>
          <p className="text-xs text-muted-foreground">
            Opzionale. Se attivo, ogni prodotto avrà un carico di magazzino al momento della
            creazione.
          </p>
        </div>
        <Switch
          id="include-stocks"
          checked={includeStocks}
          onCheckedChange={onToggleInclude}
          disabled={isSubmitting}
        />
      </section>

      {includeStocks &&
        products.map((product, index) => {
          const row = stocks[index];
          if (!row) return null;
          return (
            <div key={index} className="rounded-lg border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold">{product.name || `Prodotto ${index + 1}`}</h3>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormFieldRow id={`s-qty-${index}`} label="Quantità *">
                  <Input
                    id={`s-qty-${index}`}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={row.quantity || ''}
                    onChange={(e) =>
                      updateStock(index, {
                        quantity: e.target.value === '' ? 0 : Number(e.target.value),
                      })
                    }
                    disabled={isSubmitting}
                  />
                </FormFieldRow>
                <FormFieldRow id={`s-uom-${index}`} label="UDM quantità *">
                  <QuantityUnitSearchableSelect
                    value={row.unitOfMeasureQuantity}
                    disabled={isSubmitting}
                    onChange={(next) => updateStock(index, { unitOfMeasureQuantity: next })}
                  />
                </FormFieldRow>
                <FormFieldRow id={`s-price-${index}`} label="Prezzo unitario">
                  <Input
                    id={`s-price-${index}`}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={row.price ?? ''}
                    onChange={(e) =>
                      updateStock(index, {
                        price: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    disabled={isSubmitting}
                  />
                </FormFieldRow>
                <FormFieldRow id={`s-up-${index}`} label="UDM prezzo *">
                  <PriceUnitSearchableSelect
                    value={row.unitOfMeasurePrice ?? 'EUR'}
                    disabled={isSubmitting}
                    onChange={(next) => updateStock(index, { unitOfMeasurePrice: next })}
                  />
                </FormFieldRow>
                <FormFieldRow id={`s-ddt-${index}`} label="Numero DDT">
                  <Input
                    id={`s-ddt-${index}`}
                    value={row.ddtCode}
                    onChange={(e) => updateStock(index, { ddtCode: e.target.value })}
                    disabled={isSubmitting}
                  />
                </FormFieldRow>
                <FormFieldRow id={`s-ddtd-${index}`} label="Data DDT">
                  <Input
                    id={`s-ddtd-${index}`}
                    type="date"
                    value={row.ddtDate}
                    onChange={(e) => updateStock(index, { ddtDate: e.target.value })}
                    disabled={isSubmitting}
                  />
                </FormFieldRow>
                <FormFieldRow id={`s-inv-${index}`} label="Numero fattura">
                  <Input
                    id={`s-inv-${index}`}
                    value={row.invoiceCode ?? ''}
                    onChange={(e) => updateStock(index, { invoiceCode: e.target.value })}
                    disabled={isSubmitting}
                  />
                </FormFieldRow>
                <FormFieldRow id={`s-invd-${index}`} label="Data fattura">
                  <Input
                    id={`s-invd-${index}`}
                    type="date"
                    value={row.invoiceDate}
                    onChange={(e) => updateStock(index, { invoiceDate: e.target.value })}
                    disabled={isSubmitting}
                  />
                </FormFieldRow>
              </div>
            </div>
          );
        })}

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
          Indietro
        </Button>
        <div className="flex gap-2">
          {includeStocks && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onToggleInclude(false)}
              disabled={isSubmitting}
            >
              Salta stock
            </Button>
          )}
          <Button type="button" onClick={onSubmit} disabled={!stocksValid || isSubmitting}>
            {isSubmitting
              ? 'Creazione...'
              : includeStocks
                ? 'Crea prodotti con stock'
                : 'Crea prodotti'}
          </Button>
        </div>
      </div>
    </div>
  );
}
