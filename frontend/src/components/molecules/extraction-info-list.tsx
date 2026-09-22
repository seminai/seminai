import { useMemo } from 'react';
import { StockDetailPanel } from '@/components/organisms/stock-detail-panel';
import type { StockRow } from '@/components/molecules/stock-movements-table';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useGetProductsMe } from '@/generated/api/products/products';
import { extractArray } from '@/lib/api-response';
import { extractStocks } from '@/lib/extract-stocks';
import { extractProductDetails, type ProductDetails } from '@/lib/extract-product-details';
import type { FileExtractionResponse } from '@/types/extraction';

interface ExtractionInfoListProps {
  readonly extraction: FileExtractionResponse;
}

interface LinkedProductRow {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly registrationNumber: string;
  readonly currentStock: number;
  readonly unitOfMeasure: string;
  readonly stocks: readonly StockRow[];
  readonly details: ProductDetails;
}

export function ExtractionInfoList({ extraction }: ExtractionInfoListProps) {
  const { data: productsResponse, isLoading, refetch } = useGetProductsMe();

  const items = [
    { label: 'File', value: extraction.fileName },
    { label: 'Categoria', value: extraction.category },
    { label: 'Stato', value: extraction.status },
    { label: 'Progresso', value: `${extraction.progress}%` },
    { label: 'Creato', value: new Date(extraction.createdAt).toLocaleString('it-IT') },
    { label: 'Aggiornato', value: new Date(extraction.updatedAt).toLocaleString('it-IT') },
  ];
  const linkedProducts = useMemo<readonly LinkedProductRow[]>(() => {
    if (!productsResponse?.data) return [];
    return extractArray(productsResponse.data, 'products')
      .filter((rawProduct) => {
        const product = rawProduct as Record<string, unknown>;
        const warehouse = product.warehouse as Record<string, unknown> | null;
        const company = warehouse?.company as Record<string, unknown> | null;
        return String(company?.id ?? '') === extraction.companyId;
      })
      .map((rawProduct) => {
        const product = rawProduct as Record<string, unknown>;
        const linkedRawStocks = filterLinkedRawStocks({
          raw: product.stocks,
          targetExtractionId: extraction.id,
          targetFileId: extraction.fileId,
        });
        const linkedStocks = extractStocks(linkedRawStocks);
        const currentStock = linkedStocks.reduce(
          (sum, stock) => sum + (stock.type === 'IN' ? stock.quantity : -stock.quantity),
          0,
        );
        const details = extractProductDetails(product, linkedStocks);
        const unitOfMeasure =
          details.unitOfMeasure ??
          linkedStocks.find((stock) => stock.unitOfMeasure && stock.unitOfMeasure !== '-')
            ?.unitOfMeasure ??
          '';
        return {
          id: String(product.id ?? ''),
          name: String(product.name ?? '-'),
          category: String(product.category ?? '-'),
          registrationNumber: String(product.registrationNumber ?? '-'),
          currentStock,
          unitOfMeasure,
          stocks: linkedStocks,
          details,
        };
      })
      .filter((product) => product.id.length > 0 && product.stocks.length > 0);
  }, [productsResponse, extraction.companyId, extraction.id, extraction.fileId]);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div key={item.label} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-medium">{item.value}</span>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t pt-3">
        <h3 className="text-sm font-semibold">Prodotti e stock generati</h3>
        {!extraction.fileId && (
          <p className="text-sm text-muted-foreground">
            File sorgente non disponibile: uso il collegamento diretto tramite estrazione.
          </p>
        )}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento prodotti collegati...</p>
        ) : linkedProducts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nessun prodotto generato da questa conferma.
          </p>
        ) : (
          <Accordion
            defaultValue={linkedProducts[0] ? [linkedProducts[0].id] : []}
            className="space-y-2"
          >
            {linkedProducts.map((product) => (
              <AccordionItem key={product.id} value={product.id} className="overflow-hidden rounded-md border">
                <AccordionTrigger className="px-3 py-2 hover:no-underline">
                  <div className="grid flex-1 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3">
                    <span className="truncate font-medium">{product.name}</span>
                    <span className="text-xs text-muted-foreground">{product.category}</span>
                    <span className="text-xs font-medium">
                      {formatStock(product.currentStock, product.unitOfMeasure)}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="border-t pb-0">
                  <div className="min-h-[260px] overflow-hidden">
                    <StockDetailPanel
                      product={product}
                      companyId={extraction.companyId}
                      onSaved={() => void refetch()}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </div>
  );
}

function filterLinkedRawStocks({
  raw,
  targetExtractionId,
  targetFileId,
}: {
  readonly raw: unknown;
  readonly targetExtractionId: string;
  readonly targetFileId: string | null;
}): unknown[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item) => {
    if (!item || typeof item !== 'object') return false;
    const stock = item as Record<string, unknown>;
    const sourceExtractionId =
      typeof stock.sourceExtractionId === 'string' ? stock.sourceExtractionId : null;
    const sourceFileId = typeof stock.sourceFileId === 'string' ? stock.sourceFileId : null;
    const sourceFile = stock.sourceFile as Record<string, unknown> | null;
    const sourceFileNestedId = sourceFile && typeof sourceFile.id === 'string' ? sourceFile.id : null;
    const isLinkedByExtraction = sourceExtractionId === targetExtractionId;
    const isLinkedByFile =
      !!targetFileId && (sourceFileId === targetFileId || sourceFileNestedId === targetFileId);
    return isLinkedByExtraction || isLinkedByFile;
  });
}

function formatStock(value: number, unitOfMeasure: string): string {
  const normalized = Number.isInteger(value) ? value : Math.round(value * 100) / 100;
  const sign = normalized > 0 ? `+${normalized}` : String(normalized);
  return unitOfMeasure ? `${sign} ${unitOfMeasure}` : sign;
}
