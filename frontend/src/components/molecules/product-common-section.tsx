import { EntityPropertyList, type PropertyItem } from '@/components/molecules/entity-property-list';
import type { ProductDetails } from '@/lib/extract-product-details';

interface ProductCommonSectionProps {
  readonly name: string;
  readonly category: string;
  readonly registrationNumber: string;
  readonly details: ProductDetails;
}

export function ProductCommonSection({
  name,
  category,
  registrationNumber,
  details,
}: ProductCommonSectionProps) {
  const properties: PropertyItem[] = [
    { label: 'Nome', value: name },
    { label: 'Categoria', value: category },
    { label: 'N. Registrazione', value: registrationNumber },
    { label: 'SKU', value: details.sku },
    { label: 'UDM', value: details.unitOfMeasure },
    { label: 'Tipo', value: details.type },
    ...(details.description ? [{ label: 'Descrizione', value: details.description }] : []),
  ];
  return (
    <section className="mb-4">
      <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Generale</h3>
      <EntityPropertyList properties={properties} />
    </section>
  );
}
