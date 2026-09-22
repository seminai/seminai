import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/molecules/searchable-select';
import { InvoiceProductCategorySelect } from '@/components/molecules/invoice-product-category-select';
import { useGetProductsMe } from '@/generated/api/products/products';
import { useCompanyProductCategoryOptions } from '@/hooks/use-company-product-category-options';
import { extractArray } from '@/lib/api-response';
import { parseNullableNumber } from '@/lib/parse-utils';
import { Input } from '@/components/ui/input';
import { UnitOfMeasureSelect } from '@/components/atoms/unit-of-measure-select';
import {
  CANONICAL_UNITS,
  CONVERTED_UNITS,
  type InvoiceEntry,
  type ConfirmableStockEntry,
  type ResolvedCategory,
} from '@/types/extraction';
import { useMemo } from 'react';

interface InvoiceReviewTableProps {
  readonly category?: ResolvedCategory;
  readonly rows: readonly ConfirmableStockEntry[];
  readonly disabled: boolean;
  readonly companyId: string;
  readonly onChange: (rows: readonly ConfirmableStockEntry[]) => void;
}

interface ProductOption {
  readonly id: string;
  readonly productName: string;
  readonly label: string;
  readonly description?: string;
  readonly searchKeywords?: string;
  readonly registrationNumber: string | null;
}

function sanitizeRegistrationNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const firstNumber = trimmed.match(/^\d+/)?.[0];
  if (firstNumber) return firstNumber;
  const firstToken = trimmed.split(/\s+/)[0];
  return firstToken || null;
}

export function InvoiceReviewTable({
  category = 'invoice',
  rows,
  disabled,
  companyId,
  onChange,
}: InvoiceReviewTableProps) {
  const { isManufacturing, categoryOptions } = useCompanyProductCategoryOptions(companyId);
  const showAdministrativeStatus = !isManufacturing && category !== 'ddt';
  const showRegistrationNumber = !isManufacturing;
  const { data: productsResponse } = useGetProductsMe();
  const phytosanitaryOptions = useMemo<readonly ProductOption[]>(() => {
    if (isManufacturing || !productsResponse?.data) return [];
    return extractArray(productsResponse.data, 'products')
      .filter((item) => {
        const product = item as Record<string, unknown>;
        const warehouse = product.warehouse as Record<string, unknown> | null;
        const company = warehouse?.company as Record<string, unknown> | null;
        const productCategory = String(product.category ?? '').toUpperCase();
        return company?.id === companyId && productCategory === 'PESTICIDE';
      })
      .map((item) => {
        const product = item as Record<string, unknown>;
        const productName = String(product.name ?? '-');
        const activeIngredient =
          typeof product.principioAttivo === 'string' ? product.principioAttivo.trim() : '';
        const registrationNumber = sanitizeRegistrationNumber(
          typeof product.registrationNumber === 'string' ? product.registrationNumber : null,
        );
        const hasActiveIngredient = activeIngredient.length > 0;
        const displayLabel = hasActiveIngredient
          ? `${productName} - PA: ${activeIngredient}`
          : productName;
        return {
          id: String(product.id ?? ''),
          productName,
          label: displayLabel,
          description: hasActiveIngredient ? `Principio attivo: ${activeIngredient}` : 'Principio attivo: -',
          searchKeywords: [productName, activeIngredient, registrationNumber]
            .filter(Boolean)
            .join(' '),
          registrationNumber,
        };
      })
      .filter((option) => option.id.length > 0);
  }, [companyId, isManufacturing, productsResponse]);

  function updateRow(index: number, patch: Partial<ConfirmableStockEntry>) {
    const nextRows = rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, ...patch } : row,
    );
    onChange(nextRows);
  }

  return (
    <div className="rounded-md border">
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full min-w-[1780px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[72px]" />
            <col className="w-[460px]" />
            {showRegistrationNumber ? <col className="w-[140px]" /> : null}
            <col className="w-[170px]" />
            {showAdministrativeStatus ? <col className="w-[190px]" /> : null}
            <col className="w-[120px]" />
            <col className="w-[120px]" />
            <col className="w-[140px]" />
            <col className="w-[140px]" />
            <col className="w-[140px]" />
            <col className="w-[140px]" />
          </colgroup>
          <thead className="sticky top-0 bg-muted/70">
            <tr>
              <th className="border-b px-2 py-2 text-left text-xs">OK</th>
              <th className="border-b px-2 py-2 text-left text-xs">Prodotto</th>
              {showRegistrationNumber ? (
                <th className="border-b px-2 py-2 text-left text-xs">N. Reg.</th>
              ) : null}
              <th className="border-b px-2 py-2 text-left text-xs">Categoria</th>
              {showAdministrativeStatus ? (
                <th className="border-b px-2 py-2 text-left text-xs">Stato Amm.</th>
              ) : null}
              <th className="border-b px-2 py-2 text-left text-xs">Qta</th>
              <th className="border-b px-2 py-2 text-left text-xs">UDM</th>
              <th className="border-b px-2 py-2 text-left text-xs">Qta conv.</th>
              <th className="border-b px-2 py-2 text-left text-xs">UDM conv.</th>
              <th className="border-b px-2 py-2 text-left text-xs">Prezzo Unit.</th>
              <th className="border-b px-2 py-2 text-left text-xs">Prezzo Tot.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.productName}-${index}`} className="border-t">
                <td className="border-b px-2 py-1.5 align-middle">
                  <Checkbox
                    checked={row.accepted !== false}
                    disabled={disabled}
                    onCheckedChange={(checked) => updateRow(index, { accepted: checked === true })}
                  />
                </td>
                <td className="border-b px-2 py-1.5">
                  {!isManufacturing && row.productCategory === 'PHYTOSANITARY' ? (
                    <SearchableSelect
                      value={
                        phytosanitaryOptions.find((option) => option.productName === row.productName)?.id ??
                        ''
                      }
                      options={phytosanitaryOptions.map((option) => ({
                        value: option.id,
                        label: option.label,
                        description: option.description,
                        searchKeywords: option.searchKeywords,
                      }))}
                      placeholder={
                        phytosanitaryOptions.find((option) => option.productName === row.productName)?.label ||
                        row.productName ||
                        'Seleziona prodotto fitosanitario'
                      }
                      searchPlaceholder="Cerca prodotto..."
                      emptyMessage="Nessun prodotto trovato"
                      disabled={disabled}
                      className="h-8 w-full"
                      popoverClassName="min-w-[520px] max-w-[640px]"
                      onChange={(value) => {
                        if (!value) return;
                        const selectedProduct = phytosanitaryOptions.find((option) => option.id === value);
                        if (!selectedProduct) return;
                        updateRow(index, {
                          productName: selectedProduct.productName,
                          registrationNumber: selectedProduct.registrationNumber ?? null,
                        });
                      }}
                    />
                  ) : (
                    <Input
                      value={row.productName}
                      disabled={disabled}
                      onChange={(event) => updateRow(index, { productName: event.target.value })}
                      className="h-8"
                    />
                  )}
                </td>
                {showRegistrationNumber ? (
                  <td className="border-b px-2 py-1.5">
                    <Input
                      value={sanitizeRegistrationNumber(row.registrationNumber) ?? ''}
                      disabled={disabled}
                      onChange={(event) =>
                        updateRow(index, {
                          registrationNumber: sanitizeRegistrationNumber(event.target.value),
                        })
                      }
                      className="h-8"
                    />
                  </td>
                ) : null}
                <td className="border-b px-2 py-1.5">
                  <InvoiceProductCategorySelect
                    value={row.productCategory}
                    options={categoryOptions}
                    disabled={disabled}
                    allowCustomInput={isManufacturing}
                    onChange={(nextValue) => updateRow(index, { productCategory: nextValue })}
                  />
                </td>
                {showAdministrativeStatus ? (
                  <td className="border-b px-2 py-1.5">
                    <Input
                      value={(row as InvoiceEntry).administrativeStatus ?? ''}
                      disabled={disabled}
                      onChange={(event) =>
                        updateRow(index, {
                          administrativeStatus: event.target.value || null,
                        } as Partial<InvoiceEntry>)
                      }
                      className="h-8"
                    />
                  </td>
                ) : null}
                <td className="border-b px-2 py-1.5">
                  <Input
                    value={row.quantity ?? ''}
                    disabled={disabled}
                    onChange={(event) =>
                      updateRow(index, {
                        quantity: parseNullableNumber(event.target.value),
                      })
                    }
                    className="h-8"
                  />
                </td>
                <td className="border-b px-2 py-1.5">
                  <UnitOfMeasureSelect
                    value={row.quantityUnitOfMeasure}
                    options={CANONICAL_UNITS}
                    disabled={disabled}
                    onChange={(value) => updateRow(index, { quantityUnitOfMeasure: value })}
                  />
                </td>
                <td className="border-b px-2 py-1.5">
                  <Input
                    value={row.quantityConverted ?? ''}
                    disabled={disabled}
                    onChange={(event) =>
                      updateRow(index, {
                        quantityConverted: parseNullableNumber(event.target.value),
                      })
                    }
                    className="h-8"
                  />
                </td>
                <td className="border-b px-2 py-1.5">
                  <UnitOfMeasureSelect
                    value={row.unitMeasureConverted ?? null}
                    options={CONVERTED_UNITS}
                    disabled={disabled}
                    onChange={(value) => updateRow(index, { unitMeasureConverted: value })}
                  />
                </td>
                <td className="border-b px-2 py-1.5">
                  <Input
                    value={row.unitPrice ?? ''}
                    disabled={disabled}
                    onChange={(event) =>
                      updateRow(index, {
                        unitPrice: parseNullableNumber(event.target.value),
                      })
                    }
                    className="h-8"
                  />
                </td>
                <td className="border-b px-2 py-1.5">
                  <Input
                    value={row.totalPrice ?? ''}
                    disabled={disabled}
                    onChange={(event) =>
                      updateRow(index, {
                        totalPrice: parseNullableNumber(event.target.value),
                      })
                    }
                    className="h-8"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
