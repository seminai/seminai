import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
  postProductsBulk,
  getGetProductsMeQueryKey,
} from '@/generated/api/products/products';
import type { PostProductsBulkBodyProductsItem } from '@/generated/schemas/postProductsBulkBodyProductsItem';
import type { PostProductsBulkBodyProductsItemStock } from '@/generated/schemas/postProductsBulkBodyProductsItemStock';
import { ProductCategory } from '@/generated/schemas/productCategory';
import { WizardStepper } from '@/components/atoms/wizard-stepper';
import {
  EMPTY_PRODUCT,
  EMPTY_STOCK,
  type ProductRow,
  type StockRow,
  type WizardStep,
} from '@/components/organisms/manual-add/products-wizard-types';
import { ProductsWizardStepTarget } from '@/components/organisms/manual-add/products-wizard-step-target';
import { ProductsWizardStepProducts } from '@/components/organisms/manual-add/products-wizard-step-products';
import { ProductsWizardStepStock } from '@/components/organisms/manual-add/products-wizard-step-stock';

const STEPS: readonly { id: WizardStep; label: string }[] = [
  { id: 'target', label: 'Azienda e magazzino' },
  { id: 'products', label: 'Prodotti' },
  { id: 'stock', label: 'Stock' },
];

export function ProductsBulkForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<WizardStep>('target');
  const [companyId, setCompanyId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [products, setProducts] = useState<ProductRow[]>([{ ...EMPTY_PRODUCT }]);
  const [stocks, setStocks] = useState<StockRow[]>([{ ...EMPTY_STOCK }]);
  const [includeStocks, setIncludeStocks] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const stepIndex = STEPS.findIndex((entry) => entry.id === step);

  function syncStocksWithProducts(nextProducts: ProductRow[]) {
    setStocks((prev) =>
      nextProducts.map((_, index) => prev[index] ?? { ...EMPTY_STOCK }),
    );
  }

  function handleProductsChange(next: ProductRow[]) {
    setProducts(next);
    syncStocksWithProducts(next);
  }

  function handleCompanyChange(id: string) {
    setCompanyId(id);
    setWarehouseId('');
  }

  async function handleSubmit() {
    if (!companyId || !warehouseId) {
      toast.error('Seleziona azienda e magazzino');
      setStep('target');
      return;
    }
    const items: PostProductsBulkBodyProductsItem[] = products.map((row, index) => {
      const base: PostProductsBulkBodyProductsItem = {
        name: row.name,
        category: row.category,
        type:
          row.category === ProductCategory.OTHER
            ? row.type.trim()
            : row.type || 'Generico',
        ...(row.sku ? { sku: row.sku } : {}),
        ...(row.barcode ? { barcode: row.barcode } : {}),
        ...(row.registrationNumber ? { registrationNumber: row.registrationNumber } : {}),
        ...(row.description ? { description: row.description } : {}),
      };
      if (!includeStocks) return base;
      const stock = stocks[index];
      if (!stock) return base;
      const payload: PostProductsBulkBodyProductsItemStock = {
        quantity: stock.quantity,
        unitOfMeasureQuantity: stock.unitOfMeasureQuantity,
        unitOfMeasurePrice: stock.unitOfMeasurePrice ?? 'EUR',
        ...(stock.price !== undefined ? { price: stock.price } : {}),
        ...(stock.ddtCode.trim() ? { ddtCode: stock.ddtCode.trim() } : {}),
        ...(stock.ddtDate ? { ddtDate: stock.ddtDate } : {}),
        ...(stock.invoiceCode?.trim() ? { invoiceCode: stock.invoiceCode.trim() } : {}),
        ...(stock.invoiceDate ? { invoiceDate: stock.invoiceDate } : {}),
      };
      return { ...base, stock: payload };
    });

    setIsSubmitting(true);
    try {
      await postProductsBulk({ companyId, warehouseId, products: items });
      void queryClient.invalidateQueries({ queryKey: getGetProductsMeQueryKey() });
      toast.success(`${items.length} ${items.length === 1 ? 'prodotto creato' : 'prodotti creati'}`);
      void navigate({ to: '/add-data', search: { type: 'manual' } });
    } catch (error) {
      console.error(error);
      toast.error('Errore durante la creazione dei prodotti');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <WizardStepper steps={STEPS.map((entry) => entry.label)} currentIndex={stepIndex} />

      {step === 'target' && (
        <ProductsWizardStepTarget
          companyId={companyId}
          warehouseId={warehouseId}
          onCompanyChange={handleCompanyChange}
          onWarehouseChange={setWarehouseId}
          onNext={() => setStep('products')}
          onCancel={() => void navigate({ to: '/add-data', search: { type: 'manual' } })}
        />
      )}

      {step === 'products' && (
        <ProductsWizardStepProducts
          products={products}
          onChange={handleProductsChange}
          onBack={() => setStep('target')}
          onNext={() => setStep('stock')}
          disabled={isSubmitting}
        />
      )}

      {step === 'stock' && (
        <ProductsWizardStepStock
          products={products}
          stocks={stocks}
          includeStocks={includeStocks}
          onToggleInclude={setIncludeStocks}
          onStocksChange={setStocks}
          onBack={() => setStep('products')}
          onSubmit={() => void handleSubmit()}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
