import { Button } from '@/components/ui/button';
import { EditablePropertyList, type EditablePropertyItem } from '@/components/molecules/editable-property-list';
import { FertilizerCompositionSection } from '@/components/molecules/fertilizer-composition-section';
import { PesticideDetailsSection } from '@/components/molecules/pesticide-details-section';
import { ProductCommonSection } from '@/components/molecules/product-common-section';
import { ProductDosagesTable } from '@/components/molecules/product-dosages-table';
import { StockMovementsTable, type StockRow } from '@/components/molecules/stock-movements-table';
import type { ProductData } from './stock-detail-panel';

interface StockDetailPanelContentProps {
  readonly product: ProductData;
  readonly isEditingProduct: boolean;
  readonly editableProperties: readonly EditablePropertyItem[];
  readonly productEditValues: Readonly<Record<string, string>>;
  readonly editingStockId: string | null;
  readonly stockEditValues: Readonly<Record<string, string>>;
  readonly isAddingStock: boolean;
  readonly isSavingStock: boolean;
  readonly onProductEditChange: (key: string, value: string) => void;
  readonly onOpenLabel: (url: string, fileName: string) => void;
  readonly onStockEditStart: (stock: StockRow) => void;
  readonly onStockEditCancel: () => void;
  readonly onStockEditChange: (key: string, value: string) => void;
  readonly onStockEditSave: () => void;
  readonly onAddNew: () => void;
  readonly onCreateSave: () => void;
  readonly onOpenSourcePdf: (url: string, fileName: string) => void;
  readonly onDelete: (stock: StockRow) => void;
}

/** Product details and stock movements rendered independently from API mutations. */
export function StockDetailPanelContent(props: StockDetailPanelContentProps): React.JSX.Element {
  const { product } = props;
  return (
    <div className="flex-1 overflow-auto p-4">
      {props.isEditingProduct ? (
        <div className="mb-4">
          <EditablePropertyList
            properties={props.editableProperties}
            values={props.productEditValues}
            onChange={props.onProductEditChange}
          />
        </div>
      ) : (
        <>
          <ProductCommonSection name={product.name} category={product.category} registrationNumber={product.registrationNumber} details={product.details} />
          {product.category === 'PESTICIDE' ? (
            <>
              <PesticideDetailsSection details={product.details} productName={product.name} registrationNumber={product.registrationNumber} onOpenLabel={props.onOpenLabel} />
              <ProductDosagesTable dosaggi={product.details.dosaggi} />
            </>
          ) : null}
          {product.category === 'FERTILIZER' ? (
            <FertilizerCompositionSection composition={product.details.fertilizerComposition} />
          ) : null}
        </>
      )}
      {product.stocks.length === 0 && !props.isAddingStock ? (
        <div className="py-8 text-center">
          <p className="mb-2 text-sm text-muted-foreground">Nessun movimento di magazzino</p>
          <Button variant="outline" size="sm" onClick={props.onAddNew}>Aggiungi movimento</Button>
        </div>
      ) : (
        <StockMovementsTable
          stocks={product.stocks}
          editingId={props.editingStockId}
          editValues={props.stockEditValues}
          onEditStart={props.onStockEditStart}
          onEditCancel={props.onStockEditCancel}
          onEditChange={props.onStockEditChange}
          onEditSave={props.onStockEditSave}
          isAddingNew={props.isAddingStock}
          onAddNew={props.onAddNew}
          onCreateSave={props.onCreateSave}
          isSaving={props.isSavingStock}
          onOpenSourcePdf={props.onOpenSourcePdf}
          onDelete={props.onDelete}
        />
      )}
    </div>
  );
}
