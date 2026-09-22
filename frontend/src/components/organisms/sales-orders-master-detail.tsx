import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useSalesOrders } from '@/hooks/use-sales';
import type { SalesOrderStatus } from '@/types/sales';

const STATUS_LABEL: Record<SalesOrderStatus, string> = {
  DRAFT: 'Bozza',
  CONFIRMED: 'Confermato',
  FULFILLED: 'Evaso',
  CANCELLED: 'Annullato',
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('it-IT');
}

/** Read-only list of a company's sales orders. */
export function SalesOrdersMasterDetail({ companyId }: { readonly companyId: string }) {
  const { data: orders = [], isLoading } = useSalesOrders(companyId);

  if (isLoading) return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  if (orders.length === 0) return <p className="text-sm text-muted-foreground">Nessun ordine.</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Stato</TableHead>
          <TableHead>Righe</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((entry) => (
          <TableRow key={entry.order.id}>
            <TableCell>{formatDate(entry.order.orderDate)}</TableCell>
            <TableCell>
              <Badge variant="outline">{STATUS_LABEL[entry.order.status]}</Badge>
            </TableCell>
            <TableCell>{entry.items.length}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
