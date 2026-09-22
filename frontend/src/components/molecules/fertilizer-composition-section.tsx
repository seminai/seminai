import { EntityPropertyList, type PropertyItem } from '@/components/molecules/entity-property-list';
import type { FertilizerComposition } from '@/lib/extract-product-details';

interface FertilizerCompositionSectionProps {
  readonly composition: FertilizerComposition;
}

const ELEMENT_LABELS: ReadonlyArray<{ readonly key: keyof FertilizerComposition; readonly label: string }> = [
  { key: 'nitrogen', label: 'N' },
  { key: 'phosphorus', label: 'P₂O₅' },
  { key: 'potassium', label: 'K₂O' },
  { key: 'magnesium', label: 'MgO' },
  { key: 'calcium', label: 'CaO' },
  { key: 'sulfur', label: 'SO₃' },
  { key: 'boron', label: 'B' },
];

export function FertilizerCompositionSection({ composition }: FertilizerCompositionSectionProps) {
  const elementRows: PropertyItem[] = ELEMENT_LABELS.flatMap(({ key, label }) => {
    const value = composition[key];
    if (typeof value !== 'number') return [];
    return [{ label, value: `${value}%` }];
  });
  if (elementRows.length === 0 && !composition.unitOfFertilizer) return null;
  const properties: PropertyItem[] = [
    ...elementRows,
    ...(composition.unitOfFertilizer
      ? [{ label: 'UDM packaging', value: composition.unitOfFertilizer }]
      : []),
  ];
  return (
    <section className="mb-4">
      <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
        Composizione fertilizzante
      </h3>
      <EntityPropertyList properties={properties} />
    </section>
  );
}
