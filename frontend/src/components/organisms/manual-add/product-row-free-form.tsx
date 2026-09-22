import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormFieldRow } from '@/components/atoms/form-field-row';
import { ProductNameAutocomplete } from '@/components/molecules/product-name-autocomplete';
import type { ProductRow } from '@/components/organisms/manual-add/products-wizard-types';

type ProductRowCategoryMode = 'default' | 'other';

interface ProductRowFreeFormProps {
  readonly row: ProductRow;
  readonly index: number;
  readonly disabled?: boolean;
  readonly categoryMode?: ProductRowCategoryMode;
  readonly onChange: (partial: Partial<ProductRow>) => void;
}

export function ProductRowFreeForm({
  row,
  index,
  disabled,
  categoryMode = 'default',
  onChange,
}: ProductRowFreeFormProps) {
  const typeLabel = categoryMode === 'other' ? 'Specifica categoria *' : 'Tipo *';

  return (
    <>
      <FormFieldRow id={`p-name-${index}`} label="Nome *">
        <ProductNameAutocomplete
          id={`p-name-${index}`}
          value={row.name}
          onChange={(name) => onChange({ name })}
          disabled={disabled}
        />
      </FormFieldRow>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormFieldRow id={`p-type-${index}`} label={typeLabel}>
          <Input
            id={`p-type-${index}`}
            value={row.type}
            onChange={(e) => onChange({ type: e.target.value })}
            placeholder={categoryMode === 'other' ? 'Es. Materiale di consumo' : undefined}
            disabled={disabled}
          />
        </FormFieldRow>
        <FormFieldRow id={`p-sku-${index}`} label="SKU">
          <Input
            id={`p-sku-${index}`}
            value={row.sku ?? ''}
            onChange={(e) => onChange({ sku: e.target.value })}
            disabled={disabled}
          />
        </FormFieldRow>
        <FormFieldRow id={`p-bar-${index}`} label="Barcode">
          <Input
            id={`p-bar-${index}`}
            value={row.barcode ?? ''}
            onChange={(e) => onChange({ barcode: e.target.value })}
            disabled={disabled}
          />
        </FormFieldRow>
        <FormFieldRow id={`p-reg-${index}`} label="Numero registrazione">
          <Input
            id={`p-reg-${index}`}
            value={row.registrationNumber ?? ''}
            onChange={(e) => onChange({ registrationNumber: e.target.value })}
            disabled={disabled}
          />
        </FormFieldRow>
      </div>
      <FormFieldRow id={`p-desc-${index}`} label="Descrizione">
        <Textarea
          id={`p-desc-${index}`}
          rows={2}
          value={row.description ?? ''}
          onChange={(e) => onChange({ description: e.target.value })}
          disabled={disabled}
        />
      </FormFieldRow>
    </>
  );
}
