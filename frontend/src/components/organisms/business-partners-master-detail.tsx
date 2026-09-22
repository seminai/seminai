import { useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { useBusinessPartners, useUpdatePartnerFollowUp } from '@/hooks/use-sales';
import type { BusinessPartner, PartnerType } from '@/types/sales';
import { PARTNER_TYPE_LABELS } from '@/types/sales';

/** Per-customer "send order reminders" toggle (reuses PATCH /business-partners/:id). */
function FollowUpToggle({
  partner,
  companyId,
}: {
  readonly partner: BusinessPartner;
  readonly companyId: string;
}) {
  const update = useUpdatePartnerFollowUp();
  return (
    <Switch
      aria-label="Solleciti ordine"
      checked={partner.followUpEnabled ?? false}
      disabled={update.isPending}
      onCheckedChange={(checked) =>
        update.mutate({ partnerId: partner.id, companyId, followUpEnabled: checked })
      }
    />
  );
}

const FILTERS: ReadonlyArray<{ label: string; value: PartnerType | undefined }> = [
  { label: 'Tutti', value: undefined },
  { label: 'Clienti', value: 'CUSTOMER' },
  { label: 'Fornitori', value: 'SUPPLIER' },
];

/** Read-only list of customers/suppliers for a company. */
export function BusinessPartnersMasterDetail({ companyId }: { readonly companyId: string }) {
  const [type, setType] = useState<PartnerType | undefined>(undefined);
  const { data: partners = [], isLoading } = useBusinessPartners(companyId, type);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex gap-2">
        {FILTERS.map((filter) => (
          <Button
            key={filter.label}
            size="sm"
            variant={type === filter.value ? 'default' : 'outline'}
            onClick={() => setType(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : partners.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessuna anagrafica.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ragione sociale</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>P.IVA</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Solleciti</TableHead>
              <TableHead>Stato</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {partners.map((partner) => (
              <TableRow key={partner.id}>
                <TableCell className="font-medium">{partner.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">{PARTNER_TYPE_LABELS[partner.type]}</Badge>
                </TableCell>
                <TableCell>{partner.vatNumber ?? '—'}</TableCell>
                <TableCell>{partner.email ?? '—'}</TableCell>
                <TableCell>
                  {partner.type === 'CUSTOMER' ? (
                    <FollowUpToggle partner={partner} companyId={companyId} />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={partner.isActive ? 'default' : 'secondary'}>
                    {partner.isActive ? 'Attivo' : 'Disattivo'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
