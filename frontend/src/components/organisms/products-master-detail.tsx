import { useState, useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ResizablePanelLayout } from '@/components/molecules/resizable-panel-layout';
import { DataTableTruncatedValue } from '@/components/organisms/data-table';
import { DataTableSwitch } from '@/components/organisms/data-table-switch';
import { StockDetailPanel } from '@/components/organisms/stock-detail-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { extractStocks } from '@/lib/extract-stocks';
import { extractProductDetails, type ProductDetails } from '@/lib/extract-product-details';
import type { StockRow } from '@/components/molecules/stock-movements-table';
import {
  useGetProductsMe,
  usePostProductsSyncLabels,
} from '@/generated/api/products/products';
import { extractArray } from '@/lib/api-response';

interface ProductRow {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly registrationNumber: string;
  readonly principioAttivo: string;
  readonly formulazione: string;
  readonly composizioneFrac: string;
  readonly unitOfMeasure: string;
  readonly currentStock: number;
  readonly warehouseName: string;
  readonly companyName: string;
  readonly administrativeStatus: string;
  readonly stocks: readonly StockRow[];
  readonly details: ProductDetails;
}

const COLUMN_LABELS: Record<string, string> = {
  name: 'Nome Prodotto',
  category: 'Categoria',
  registrationNumber: 'N. Registrazione',
  principioAttivo: 'Principio Attivo',
  formulazione: 'Formulazione',
  composizioneFrac: 'Composizione/FRAC',
  unitOfMeasure: 'UDM',
  currentStock: 'Stock',
  warehouseName: 'Magazzino',
  companyName: 'Azienda',
  administrativeStatus: 'Stato amministrativo',
};

function renderAdministrativeStatus(value: string) {
  if (!value || value === '-') return <span className="text-muted-foreground">—</span>;
  const lower = value.toLowerCase();
  if (lower.startsWith('revocato')) {
    return <Badge variant="destructive">{value}</Badge>;
  }
  if (lower.startsWith('scaduto')) {
    return <Badge variant="secondary">{value}</Badge>;
  }
  return <DataTableTruncatedValue value={value} />;
}

const columns: ColumnDef<ProductRow, unknown>[] = [
  { accessorKey: 'name', header: 'Nome Prodotto', filterFn: 'multiValue' as never },
  {
    accessorKey: 'currentStock',
    header: 'Stock',
    cell: ({ getValue }) => {
      const raw = getValue() as number;
      const value = Number.isInteger(raw) ? raw : Math.round(raw * 100) / 100;
      const formatted = value > 0 ? `+${value}` : String(value);
      return (
        <span className={value <= 0 ? 'font-medium text-red-600' : 'font-medium text-green-600'}>
          {formatted}
        </span>
      );
    },
  },
  { accessorKey: 'unitOfMeasure', header: 'UDM', filterFn: 'multiValue' as never },
  { accessorKey: 'category', header: 'Categoria', filterFn: 'multiValue' as never },
  { accessorKey: 'registrationNumber', header: 'N. Reg.', filterFn: 'multiValue' as never },
  { accessorKey: 'principioAttivo', header: 'Principio Attivo', filterFn: 'multiValue' as never },
  { accessorKey: 'formulazione', header: 'Formulazione', filterFn: 'multiValue' as never },
  { accessorKey: 'composizioneFrac', header: 'Composizione/FRAC', filterFn: 'multiValue' as never },
  { accessorKey: 'warehouseName', header: 'Magazzino', filterFn: 'multiValue' as never },
  { accessorKey: 'companyName', header: 'Azienda', filterFn: 'multiValue' as never },
  {
    accessorKey: 'administrativeStatus',
    header: 'Stato amministrativo',
    filterFn: 'multiValue' as never,
    cell: ({ getValue }) => renderAdministrativeStatus(String(getValue() ?? '')),
  },
];

const TODAY_FORMATTER = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function joinComposizioneFrac(details: ProductDetails): string {
  const parts = [details.composizione, details.meccanismoFrac].filter(
    (p): p is string => p !== null && p.length > 0,
  );
  return parts.length === 0 ? '-' : parts.join(' · ');
}

interface ProductsMasterDetailProps {
  readonly companyId: string;
}

export function ProductsMasterDetail({ companyId }: ProductsMasterDetailProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: response, isLoading, refetch } = useGetProductsMe();
  const syncLabels = usePostProductsSyncLabels();

  const handleSyncLabels = () => {
    syncLabels.mutate(
      { data: { companyId } },
      {
        onSuccess: (res) => {
          const queued = res?.data?.data?.queued ?? 0;
          if (queued === 0) {
            toast.info('Etichette già aggiornate per tutti i prodotti.');
            return;
          }
          toast.success(
            `Sincronizzazione avviata: ${queued} prodotti in coda. I dati appariranno tra qualche minuto.`,
          );
          setTimeout(() => void refetch(), 30_000);
        },
        onError: () => {
          toast.error('Errore durante l\'avvio della sincronizzazione etichette.');
        },
      },
    );
  };

  const products = useMemo<ProductRow[]>(() => {
    if (!response?.data) return [];
    const list = extractArray(response.data, 'products').filter((p) => {
      const row = p as { warehouse?: { company?: { id?: string } } };
      return String(row.warehouse?.company?.id ?? '') === companyId;
    });
    const rows: ProductRow[] = [];
    for (const p of list) {
      const stocks = extractStocks(p.stocks);
      const details = extractProductDetails(p, stocks);
      const warehouse = (p as { warehouse?: { name?: string; company?: { name?: string } } }).warehouse;
      const administrativeStatus = (p as { administrativeStatus?: string | null }).administrativeStatus;
      const base = {
        id: String(p.id ?? ''),
        name: String(p.name ?? '-'),
        category: String(p.category ?? '-'),
        registrationNumber: String(p.registrationNumber ?? '-'),
        principioAttivo: details.principioAttivo ?? '-',
        formulazione: details.formulazione ?? '-',
        composizioneFrac: joinComposizioneFrac(details),
        warehouseName: warehouse?.name ?? '-',
        companyName: warehouse?.company?.name ?? '-',
        administrativeStatus: administrativeStatus ?? '-',
        stocks,
        details,
      };

      const stocksByUdm = new Map<string, StockRow[]>();
      for (const s of stocks) {
        const list = stocksByUdm.get(s.unitOfMeasure) ?? [];
        list.push(s);
        stocksByUdm.set(s.unitOfMeasure, list);
      }

      if (stocksByUdm.size <= 1) {
        const udm = stocksByUdm.size === 1
          ? stocksByUdm.keys().next().value as string
          : details.unitOfMeasure ?? '-';
        const currentStock = stocks.reduce(
          (sum, s) => sum + (s.type === 'IN' ? s.quantity : -s.quantity),
          0,
        );
        rows.push({ ...base, unitOfMeasure: udm, currentStock });
        continue;
      }

      for (const [udm, udmStocks] of stocksByUdm) {
        const currentStock = udmStocks.reduce(
          (sum, s) => sum + (s.type === 'IN' ? s.quantity : -s.quantity),
          0,
        );
        rows.push({ ...base, unitOfMeasure: udm, currentStock });
      }
    }
    return rows;
  }, [response, companyId]);

  const selected = products.find((p) => p.id === selectedId);

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Caricamento magazzino...</div>;
  }

  if (products.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Non ci sono dati</p>;
  }

  const syncLabelsButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSyncLabels}
      disabled={syncLabels.isPending}
    >
      <RefreshCw className={syncLabels.isPending ? 'animate-spin' : undefined} />
      {syncLabels.isPending ? 'Sincronizzazione…' : 'Sincronizza etichette'}
    </Button>
  );

  const table = (
    <div className="flex h-full flex-col">
      <DataTableSwitch
        data={products}
        columns={columns}
        columnLabels={COLUMN_LABELS}
        exportSection="magazzino"
        onRowClick={(row) => setSelectedId(row.id === selectedId ? null : row.id)}
        extraExportColumns={[
          { label: 'Data', getValue: () => TODAY_FORMATTER.format(new Date()) },
        ]}
        toolbarRightSlot={syncLabelsButton}
      />
    </div>
  );

  if (!selected) return table;

  return (
    <ResizablePanelLayout
      left={table}
      right={
        <StockDetailPanel
          product={selected}
          companyId={companyId}
          onSaved={() => void refetch()}
          onClose={() => setSelectedId(null)}
        />
      }
    />
  );
}
