import { FlowPageHeader } from '@/components/molecules/flow-page-header';
import { getAddDataBackTarget } from '@/lib/add-data-back-target';
import { CompanySingleForm } from '@/components/organisms/manual-add/company-single-form';
import { ProductsBulkForm } from '@/components/organisms/manual-add/products-bulk-form';
import { FieldsBulkForm } from '@/components/organisms/manual-add/fields-bulk-form';
import { ProductionUnitsBulkForm } from '@/components/organisms/manual-add/production-units-bulk-form';
import { BusinessPartnerForm } from '@/components/organisms/manual-add/business-partner-form';

type ManualEntity = 'companies' | 'products' | 'fields' | 'production-units' | 'business-partners';

const TITLES: Record<ManualEntity, string> = {
  companies: 'Aggiungi azienda',
  products: 'Aggiungi prodotti',
  fields: 'Aggiungi campi',
  'production-units': 'Aggiungi unità produttive',
  'business-partners': 'Aggiungi cliente / fornitore',
};

interface ManualAddEntityFormProps {
  readonly entity: ManualEntity;
  readonly extractionIds?: readonly string[];
  readonly prefillCompanyId?: string;
}

export function ManualAddEntityForm({
  entity,
  extractionIds,
  prefillCompanyId,
}: ManualAddEntityFormProps) {
  const isProductionUnits = entity === 'production-units';

  return (
    <main className="flex h-full min-h-0 flex-col">
      <FlowPageHeader
        fallback={getAddDataBackTarget({ type: 'manual', entity })}
        title={TITLES[entity]}
      />

      <div
        className={
          isProductionUnits
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3'
            : 'flex-1 overflow-y-auto px-6 py-6'
        }
      >
        {entity === 'companies' && <CompanySingleForm />}
        {entity === 'products' && <ProductsBulkForm />}
        {entity === 'fields' && <FieldsBulkForm />}
        {entity === 'production-units' && (
          <ProductionUnitsBulkForm
            extractionIds={extractionIds}
            prefillCompanyId={prefillCompanyId}
          />
        )}
        {entity === 'business-partners' && <BusinessPartnerForm />}
      </div>
    </main>
  );
}
