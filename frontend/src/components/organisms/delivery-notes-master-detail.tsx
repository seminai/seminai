import { Printer, Ban } from 'lucide-react';
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
import { toast } from 'sonner';
import {
  deliveryNotePrintUrl,
  useCancelDeliveryNote,
  useDeliveryNotes,
} from '@/hooks/use-sales';
import type { DeliveryNoteStatus } from '@/types/sales';

const STATUS_LABEL: Record<DeliveryNoteStatus, string> = {
  GENERATED: 'Generato',
  SENT: 'Inviato',
  CANCELLED: 'Annullato',
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('it-IT');
}

/** Read-only list of DDTs with print/cancel actions. */
export function DeliveryNotesMasterDetail({ companyId }: { readonly companyId: string }) {
  const { data: deliveryNotes = [], isLoading } = useDeliveryNotes(companyId);
  const cancelMutation = useCancelDeliveryNote(companyId);

  if (isLoading) return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  if (deliveryNotes.length === 0) return <p className="text-sm text-muted-foreground">Nessun DDT.</p>;

  const handleCancel = (deliveryNoteId: string) => {
    cancelMutation.mutate(
      { deliveryNoteId },
      {
        onSuccess: () => toast.success('DDT annullato, magazzino ripristinato'),
        onError: () => toast.error('Errore durante l\'annullamento del DDT'),
      },
    );
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Numero</TableHead>
          <TableHead>Data</TableHead>
          <TableHead>Destinatario</TableHead>
          <TableHead>Stato</TableHead>
          <TableHead className="text-right">Azioni</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {deliveryNotes.map((entry) => {
          const ddt = entry.deliveryNote;
          const isCancelled = ddt.status === 'CANCELLED';
          return (
            <TableRow key={ddt.id}>
              <TableCell className="font-medium">
                {ddt.number}/{ddt.year}
              </TableCell>
              <TableCell>{formatDate(ddt.ddtDate)}</TableCell>
              <TableCell>{ddt.customerSnapshot.name}</TableCell>
              <TableCell>
                <Badge variant={isCancelled ? 'secondary' : 'default'}>
                  {STATUS_LABEL[ddt.status]}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(deliveryNotePrintUrl(ddt.id), '_blank')}
                  >
                    <Printer className="mr-1.5 h-3.5 w-3.5" />
                    Stampa
                  </Button>
                  {!isCancelled && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={cancelMutation.isPending}
                      onClick={() => handleCancel(ddt.id)}
                    >
                      <Ban className="mr-1.5 h-3.5 w-3.5" />
                      Annulla
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
