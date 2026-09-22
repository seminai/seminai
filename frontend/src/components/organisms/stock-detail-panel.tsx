import { useState, useMemo, useCallback } from 'react';
import { EditablePropertyList } from '@/components/molecules/editable-property-list';
import type { EditablePropertyItem } from '@/components/molecules/editable-property-list';
import { ProductCommonSection } from '@/components/molecules/product-common-section';
import { PesticideDetailsSection } from '@/components/molecules/pesticide-details-section';
import { FertilizerCompositionSection } from '@/components/molecules/fertilizer-composition-section';
import { ProductDosagesTable } from '@/components/molecules/product-dosages-table';
import { StockMovementsTable } from '@/components/molecules/stock-movements-table';
import type { StockRow } from '@/components/molecules/stock-movements-table';
import type { ProductDetails } from '@/lib/extract-product-details';
import { PdfSidebarView } from '@/components/molecules/pdf-sidebar-view';
import { StockDetailPanelHeader } from '@/components/molecules/stock-detail-panel-header';
import { Button } from '@/components/ui/button';
import {
  usePostStocks,
  usePatchStocksStockId,
  useDeleteStocksStockId,
} from '@/generated/api/stocks/stocks';
import { ConfirmDeleteDialog } from '@/components/molecules/confirm-delete-dialog';
import { usePutProductsId, usePostProductsSyncLabels } from '@/generated/api/products/products';
import type { ProductCategory } from '@/generated/schemas';
import { toast } from 'sonner';

type PdfView =
  | { readonly kind: 'closed' }
  | { readonly kind: 'label'; readonly url: string; readonly fileName: string }
  | { readonly kind: 'stock'; readonly url: string; readonly fileName: string };

const CATEGORY_OPTIONS = [
  { value: 'PESTICIDE', label: 'Fitosanitario' },
  { value: 'FERTILIZER', label: 'Fertilizzante' },
  { value: 'SEED', label: 'Seme' },
  { value: 'HARVEST', label: 'Raccolto' },
  { value: 'EQUIPMENT', label: 'Attrezzatura' },
  { value: 'PACKAGING', label: 'Imballaggio' },
  { value: 'OTHER', label: 'Altro' },
] as const;

interface ProductData {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly registrationNumber: string;
  readonly currentStock: number;
  readonly stocks: readonly StockRow[];
  readonly details: ProductDetails;
}

interface StockDetailPanelProps {
  readonly product: ProductData;
  readonly companyId: string;
  readonly onSaved: () => void;
  readonly onClose?: () => void;
}

export function StockDetailPanel({ product, companyId, onSaved, onClose }: StockDetailPanelProps) {
  const [pdfView, setPdfView] = useState<PdfView>({ kind: 'closed' });
  const [isEditingProduct, setIsEditingProduct] = useState(false);
  const [productEditValues, setProductEditValues] = useState<Record<string, string>>({});
  const { mutate: updateProduct, isPending: isSavingProduct } = usePutProductsId();

  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [isAddingStock, setIsAddingStock] = useState(false);
  const [stockEditValues, setStockEditValues] = useState<Record<string, string>>({});
  const [deletingStock, setDeletingStock] = useState<StockRow | null>(null);
  const { mutate: patchStock, isPending: isPatchingStock } = usePatchStocksStockId();
  const { mutate: createStock, isPending: isCreatingStock } = usePostStocks();
  const { mutate: deleteStock, isPending: isDeletingStock } = useDeleteStocksStockId();
  const { mutate: syncLabel, isPending: isSyncingLabel } = usePostProductsSyncLabels();

  const isSavingStock = isPatchingStock || isCreatingStock;
  const canReextractLabel = product.category === 'PESTICIDE' || product.category === 'FERTILIZER';

  const handleReextractLabel = useCallback(() => {
    syncLabel(
      { data: { productIds: [product.id], forceRefresh: true } },
      {
        onSuccess: (res) => {
          const queued = res?.data?.data?.queued ?? 0;
          if (queued === 0) {
            toast.info('Nessuna estrazione necessaria per questo prodotto.');
            return;
          }
          toast.success('Re-estrazione etichetta avviata. I dati appariranno tra qualche minuto.');
          setTimeout(() => onSaved(), 20_000);
        },
        onError: () => toast.error('Errore durante la re-estrazione dell\'etichetta.'),
      },
    );
  }, [product.id, syncLabel, onSaved]);

  const handleEditProduct = useCallback(() => {
    setProductEditValues({
      name: product.name,
      category: product.category,
      registrationNumber: product.registrationNumber,
    });
    setIsEditingProduct(true);
  }, [product]);

  const handleCancelProduct = useCallback(() => {
    setIsEditingProduct(false);
    setProductEditValues({});
  }, []);

  const handleSaveProduct = useCallback(() => {
    updateProduct(
      {
        id: product.id,
        data: {
          name: productEditValues.name,
          category: productEditValues.category as ProductCategory,
          registrationNumber: productEditValues.registrationNumber || null,
        },
      },
      {
        onSuccess: () => {
          setIsEditingProduct(false);
          setProductEditValues({});
          onSaved();
        },
      },
    );
  }, [product.id, productEditValues, updateProduct, onSaved]);

  const handleStockEditStart = useCallback((stock: StockRow) => {
    setEditingStockId(stock.id);
    setStockEditValues({
      type: stock.type,
      quantity: String(Math.abs(stock.quantity)),
      unitOfMeasure: stock.unitOfMeasure,
      ddtCode: stock.ddtCode === '-' ? '' : stock.ddtCode,
      date: stock.dateRaw ?? '',
      supplier: stock.supplier === '-' ? '' : stock.supplier,
      price: String(stock.price),
      unitOfMeasurePrice: stock.unitOfMeasurePrice,
    });
  }, []);

  const handleStockEditCancel = useCallback(() => {
    setEditingStockId(null);
    setIsAddingStock(false);
    setStockEditValues({});
  }, []);

  const handleStockEditSave = useCallback(() => {
    if (!editingStockId) return;
    patchStock(
      {
        stockId: editingStockId,
        data: {
          type: stockEditValues.type,
          quantity: Number(stockEditValues.quantity),
          unitOfMeasureQuantity: stockEditValues.unitOfMeasure,
          ddtCode: stockEditValues.ddtCode || undefined,
          ddtDate: stockEditValues.date || undefined,
          companySupplierName: stockEditValues.supplier || undefined,
          price: Number(stockEditValues.price || 0),
          unitOfMeasurePrice: stockEditValues.unitOfMeasurePrice || undefined,
        },
      },
      {
        onSuccess: () => {
          setEditingStockId(null);
          setStockEditValues({});
          onSaved();
        },
      },
    );
  }, [editingStockId, stockEditValues, patchStock, onSaved]);

  const handleAddNew = useCallback(() => {
    setIsAddingStock(true);
    setStockEditValues({
      type: 'IN',
      quantity: '',
      unitOfMeasure: '',
      ddtCode: '',
      date: '',
      supplier: '',
      price: '0',
      unitOfMeasurePrice: '€',
    });
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    if (!deletingStock) return;
    deleteStock(
      { stockId: deletingStock.id, params: { companyId } },
      {
        onSuccess: () => {
          setDeletingStock(null);
          toast.success('Movimento eliminato');
          onSaved();
        },
        onError: (error) => {
          const status = (error as unknown as { status?: number } | null)?.status;
          if (status === 409) {
            toast.error('Movimento collegato a un trattamento verificato: non eliminabile.');
          } else if (status === 404) {
            toast.error('Movimento non trovato.');
          } else {
            toast.error('Errore durante l\'eliminazione del movimento.');
          }
        },
      },
    );
  }, [deletingStock, deleteStock, companyId, onSaved]);

  const handleCreateSave = useCallback(() => {
    createStock(
      {
        data: {
          companyId,
          productId: product.id,
          type: stockEditValues.type,
          quantity: Number(stockEditValues.quantity),
          unitOfMeasureQuantity: stockEditValues.unitOfMeasure,
          price: Number(stockEditValues.price || 0),
          unitOfMeasurePrice: stockEditValues.unitOfMeasurePrice || '€',
          ddtCode: stockEditValues.ddtCode || undefined,
          companySupplierName: stockEditValues.supplier || undefined,
        },
      },
      {
        onSuccess: () => {
          setIsAddingStock(false);
          setStockEditValues({});
          onSaved();
        },
      },
    );
  }, [companyId, product.id, stockEditValues, createStock, onSaved]);

  const editableProperties = useMemo<EditablePropertyItem[]>(
    () => [
      { label: 'Nome', value: product.name, key: 'name' },
      { label: 'Categoria', value: product.category, key: 'category', type: 'select' as const, options: [...CATEGORY_OPTIONS] },
      { label: 'N. Registrazione', value: product.registrationNumber, key: 'registrationNumber' },
    ],
    [product],
  );

  if (pdfView.kind !== 'closed') {
    return (
      <PdfSidebarView
        url={pdfView.url}
        fileName={pdfView.fileName}
        subtitle={pdfView.kind === 'label' ? 'Etichetta prodotto' : 'Documento sorgente'}
        onBack={() => setPdfView({ kind: 'closed' })}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <StockDetailPanelHeader
        name={product.name}
        category={product.category}
        isEditingProduct={isEditingProduct}
        isSavingProduct={isSavingProduct}
        canReextractLabel={canReextractLabel}
        isSyncingLabel={isSyncingLabel}
        onEdit={handleEditProduct}
        onCancel={handleCancelProduct}
        onSave={handleSaveProduct}
        onReextractLabel={handleReextractLabel}
        onClose={onClose}
      />
      <div className="flex-1 overflow-auto p-4">
        {isEditingProduct ? (
          <div className="mb-4">
            <EditablePropertyList
              properties={editableProperties}
              values={productEditValues}
              onChange={(k, v) => setProductEditValues((prev) => ({ ...prev, [k]: v }))}
            />
          </div>
        ) : (
          <>
            <ProductCommonSection
              name={product.name}
              category={product.category}
              registrationNumber={product.registrationNumber}
              details={product.details}
            />
            {product.category === 'PESTICIDE' ? (
              <>
                <PesticideDetailsSection
                  details={product.details}
                  productName={product.name}
                  registrationNumber={product.registrationNumber}
                  onOpenLabel={(url, fileName) => setPdfView({ kind: 'label', url, fileName })}
                />
                <ProductDosagesTable dosaggi={product.details.dosaggi} />
              </>
            ) : null}
            {product.category === 'FERTILIZER' ? (
              <FertilizerCompositionSection composition={product.details.fertilizerComposition} />
            ) : null}
          </>
        )}
        {product.stocks.length === 0 && !isAddingStock ? (
          <div className="py-8 text-center">
            <p className="mb-2 text-sm text-muted-foreground">Nessun movimento di magazzino</p>
            <Button variant="outline" size="sm" onClick={handleAddNew}>
              Aggiungi movimento
            </Button>
          </div>
        ) : (
          <StockMovementsTable
            stocks={product.stocks}
            editingId={editingStockId}
            editValues={stockEditValues}
            onEditStart={handleStockEditStart}
            onEditCancel={handleStockEditCancel}
            onEditChange={(k, v) => setStockEditValues((prev) => ({ ...prev, [k]: v }))}
            onEditSave={handleStockEditSave}
            isAddingNew={isAddingStock}
            onAddNew={handleAddNew}
            onCreateSave={handleCreateSave}
            isSaving={isSavingStock}
            onOpenSourcePdf={(url, fileName) => setPdfView({ kind: 'stock', url, fileName })}
            onDelete={(stock) => setDeletingStock(stock)}
          />
        )}
      </div>
      <ConfirmDeleteDialog
        open={!!deletingStock}
        onOpenChange={(o) => !o && setDeletingStock(null)}
        title="Elimina movimento"
        description={
          deletingStock
            ? `Vuoi eliminare questo movimento di ${Math.abs(deletingStock.quantity)} ${deletingStock.unitOfMeasure}? L'operazione è irreversibile.`
            : ''
        }
        isPending={isDeletingStock}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}

