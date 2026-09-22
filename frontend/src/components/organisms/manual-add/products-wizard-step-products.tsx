import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormFieldRow } from '@/components/atoms/form-field-row';
import { ProductCategory } from '@/generated/schemas/productCategory';
import {
  CATEGORY_LABELS,
  EMPTY_PRODUCT,
  type ProductRow,
} from '@/components/organisms/manual-add/products-wizard-types';
import {
  MinistryProductPicker,
  type MinistryPick,
} from '@/components/organisms/manual-add/ministry-product-picker';
import { ProductRowFreeForm } from '@/components/organisms/manual-add/product-row-free-form';

interface ProductsWizardStepProductsProps {
  readonly products: readonly ProductRow[];
  readonly onChange: (next: ProductRow[]) => void;
  readonly onBack: () => void;
  readonly onNext: () => void;
  readonly disabled?: boolean;
}

export function ProductsWizardStepProducts({
  products,
  onChange,
  onBack,
  onNext,
  disabled,
}: ProductsWizardStepProductsProps) {
  function updateRow(index: number, partial: Partial<ProductRow>) {
    onChange(products.map((row, i) => (i === index ? { ...row, ...partial } : row)));
  }

  function removeRow(index: number) {
    onChange(products.filter((_, i) => i !== index));
  }

  function appendRow() {
    onChange([...products, { ...EMPTY_PRODUCT }]);
  }

  function applyMinistryPick(index: number, pick: MinistryPick) {
    updateRow(index, {
      ministryId: pick.ministryId,
      name: pick.name,
      registrationNumber: pick.registrationNumber ?? '',
      activeIngredient: pick.activeIngredient ?? '',
      type: pick.type ?? 'Fitofarmaco',
    });
  }

  function clearMinistryPick(index: number) {
    updateRow(index, {
      ministryId: undefined,
      activeIngredient: undefined,
      name: '',
      registrationNumber: '',
    });
  }

  const canProceed =
    products.length > 0 &&
    products.every((row) => {
      if (row.category === ProductCategory.PESTICIDE) {
        return !!row.ministryId && row.name.trim().length > 0;
      }
      return row.name.trim().length > 0 && row.type.trim().length > 0;
    });

  return (
    <div className="flex flex-col gap-4">
      {products.map((row, index) => {
        const isPesticide = row.category === ProductCategory.PESTICIDE;
        const isOther = row.category === ProductCategory.OTHER;
        return (
          <div key={index} className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Prodotto {index + 1}</h3>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => removeRow(index)}
                disabled={products.length === 1 || disabled}
                aria-label="Rimuovi prodotto"
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>

            <FormFieldRow id={`p-cat-${index}`} label="Categoria *">
              <Select
                value={row.category}
                onValueChange={(next) => {
                  const cat = (next ?? ProductCategory.FERTILIZER) as ProductCategory;
                  const isPesticideCategory = cat === ProductCategory.PESTICIDE;
                  const isOtherCategory = cat === ProductCategory.OTHER;
                  updateRow(index, {
                    category: cat,
                    ministryId: isPesticideCategory ? row.ministryId : undefined,
                    activeIngredient: isPesticideCategory ? row.activeIngredient : undefined,
                    type: isOtherCategory ? '' : row.type || 'Generico',
                  });
                }}
                disabled={disabled}
              >
                <SelectTrigger id={`p-cat-${index}`}>
                  <SelectValue>
                    {(value) =>
                      value && value in CATEGORY_LABELS
                        ? CATEGORY_LABELS[value as ProductCategory]
                        : 'Seleziona categoria'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.values(ProductCategory).map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormFieldRow>

            {isPesticide ? (
              <PesticideSection
                row={row}
                index={index}
                disabled={disabled}
                onPick={(pick) => applyMinistryPick(index, pick)}
                onClear={() => clearMinistryPick(index)}
                onChangeSku={(value) => updateRow(index, { sku: value })}
                onChangeBarcode={(value) => updateRow(index, { barcode: value })}
              />
            ) : (
              <ProductRowFreeForm
                row={row}
                index={index}
                disabled={disabled}
                categoryMode={isOther ? 'other' : 'default'}
                onChange={(partial) => updateRow(index, partial)}
              />
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={appendRow} disabled={disabled}>
          <Plus className="mr-1.5 h-4 w-4" />
          Aggiungi prodotto
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onBack} disabled={disabled}>
            Indietro
          </Button>
          <Button type="button" onClick={onNext} disabled={!canProceed || disabled}>
            Avanti
          </Button>
        </div>
      </div>
    </div>
  );
}

interface PesticideSectionProps {
  readonly row: ProductRow;
  readonly index: number;
  readonly disabled?: boolean;
  readonly onPick: (pick: MinistryPick) => void;
  readonly onClear: () => void;
  readonly onChangeSku: (value: string) => void;
  readonly onChangeBarcode: (value: string) => void;
}

function PesticideSection({
  row,
  index,
  disabled,
  onPick,
  onClear,
  onChangeSku,
  onChangeBarcode,
}: PesticideSectionProps) {
  return (
    <>
      {row.ministryId ? (
        <div className="mt-2 rounded-md border bg-muted/30 p-3">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold">{row.name}</p>
              {row.activeIngredient && (
                <p className="text-xs text-muted-foreground">{row.activeIngredient}</p>
              )}
              {row.registrationNumber && (
                <p className="text-xs text-muted-foreground">
                  Reg. n. {row.registrationNumber}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClear}
              disabled={disabled}
            >
              Cambia
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormFieldRow id={`p-sku-${index}`} label="SKU interno">
              <Input
                id={`p-sku-${index}`}
                value={row.sku ?? ''}
                onChange={(e) => onChangeSku(e.target.value)}
                disabled={disabled}
              />
            </FormFieldRow>
            <FormFieldRow id={`p-bar-${index}`} label="Barcode">
              <Input
                id={`p-bar-${index}`}
                value={row.barcode ?? ''}
                onChange={(e) => onChangeBarcode(e.target.value)}
                disabled={disabled}
              />
            </FormFieldRow>
          </div>
        </div>
      ) : (
        <MinistryProductPicker
          selectedMinistryId={row.ministryId}
          onSelect={onPick}
          disabled={disabled}
        />
      )}
    </>
  );
}

