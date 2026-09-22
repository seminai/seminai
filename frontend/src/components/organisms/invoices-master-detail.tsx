import { BellRing, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useInvoices, useSendPaymentReminder, useMarkInvoicePaid } from '@/hooks/use-sales';
import type { InvoiceStatus } from '@/types/sales';

const STATUS: Record<InvoiceStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  OPEN: { label: 'Aperta', variant: 'default' },
  OVERDUE: { label: 'Scaduta', variant: 'destructive' },
  PAID: { label: 'Pagata', variant: 'secondary' },
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('it-IT');
}

/** List of sales invoices with "Sollecita" (reminder) + "Segna pagata" actions. */
export function InvoicesMasterDetail({ companyId }: { readonly companyId: string }) {
  const { data: invoices = [], isLoading } = useInvoices(companyId);
  const sendReminder = useSendPaymentReminder();
  const markPaid = useMarkInvoicePaid();
  const isMutating = sendReminder.isPending || markPaid.isPending;

  if (isLoading) return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  if (invoices.length === 0) return <p className="text-sm text-muted-foreground">Nessuna fattura.</p>;

  const handleReminder = (invoiceId: string) => {
    sendReminder.mutate(
      { invoiceId, companyId },
      {
        onSuccess: () => toast.success('Sollecito di pagamento inviato'),
        onError: () => toast.error('Invio sollecito non riuscito'),
      },
    );
  };

  const handleMarkPaid = (invoiceId: string) => {
    markPaid.mutate(
      { invoiceId, companyId },
      {
        onSuccess: () => toast.success('Fattura segnata come pagata'),
        onError: () => toast.error('Operazione non riuscita'),
      },
    );
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Numero</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead className="text-right">Importo</TableHead>
          <TableHead>Scadenza</TableHead>
          <TableHead>Stato</TableHead>
          <TableHead className="text-right">Azioni</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => (
          <TableRow key={invoice.id}>
            <TableCell className="font-medium">{invoice.label}</TableCell>
            <TableCell>{invoice.customerName}</TableCell>
            <TableCell className="text-right tabular-nums">
              € {invoice.totalAmount.toFixed(2)}
            </TableCell>
            <TableCell>{formatDate(invoice.dueDate)}</TableCell>
            <TableCell>
              <Badge variant={STATUS[invoice.status].variant}>{STATUS[invoice.status].label}</Badge>
            </TableCell>
            <TableCell className="text-right">
              {invoice.status === 'PAID' ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isMutating}
                    onClick={() => handleReminder(invoice.id)}
                  >
                    <BellRing className="mr-1.5 h-3.5 w-3.5" />
                    Sollecita
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isMutating}
                    onClick={() => handleMarkPaid(invoice.id)}
                  >
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                    Segna pagata
                  </Button>
                </div>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
