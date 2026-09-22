import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BusinessPartnersMasterDetail } from '@/components/organisms/business-partners-master-detail';
import { SalesOrdersMasterDetail } from '@/components/organisms/sales-orders-master-detail';
import { DeliveryNotesMasterDetail } from '@/components/organisms/delivery-notes-master-detail';
import { InvoicesMasterDetail } from '@/components/organisms/invoices-master-detail';

interface SalesMasterDetailProps {
  readonly companyId: string;
  /** When true (default) renders its own page title and padding (standalone route). */
  readonly showTitle?: boolean;
}

/** Read-only "Vendite" section: anagrafiche, ordini and DDT for a company. */
export function SalesMasterDetail({ companyId, showTitle = true }: SalesMasterDetailProps) {
  return (
    <div className={showTitle ? 'flex h-full flex-col p-6' : 'flex flex-col'}>
      {showTitle ? <h1 className="mb-4 text-lg font-semibold">Vendite</h1> : null}
      <Tabs defaultValue="partners" className="flex flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="partners">Clienti / Fornitori</TabsTrigger>
          <TabsTrigger value="orders">Ordini</TabsTrigger>
          <TabsTrigger value="ddt">DDT</TabsTrigger>
          <TabsTrigger value="invoices">Fatture</TabsTrigger>
        </TabsList>
        <TabsContent value="partners" className="flex-1 overflow-y-auto pt-4">
          <BusinessPartnersMasterDetail companyId={companyId} />
        </TabsContent>
        <TabsContent value="orders" className="flex-1 overflow-y-auto pt-4">
          <SalesOrdersMasterDetail companyId={companyId} />
        </TabsContent>
        <TabsContent value="ddt" className="flex-1 overflow-y-auto pt-4">
          <DeliveryNotesMasterDetail companyId={companyId} />
        </TabsContent>
        <TabsContent value="invoices" className="flex-1 overflow-y-auto pt-4">
          <InvoicesMasterDetail companyId={companyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
