import { useMemo } from 'react';
import { EntityPropertyList } from '@/components/molecules/entity-property-list';
import {
  EditablePropertyList,
} from '@/components/molecules/editable-property-list';
import {
  getSharedFieldLabels,
  type DocumentSharedFieldValues,
} from '@/lib/invoice-shared-fields-utils';
import type { ResolvedCategory } from '@/types/extraction';

interface InvoiceSharedFieldsProps {
  readonly category: ResolvedCategory;
  readonly values: DocumentSharedFieldValues;
  readonly editable: boolean;
  readonly onChange?: (key: string, value: string) => void;
}

export function InvoiceSharedFields({
  category,
  values,
  editable,
  onChange,
}: InvoiceSharedFieldsProps) {
  const labels = getSharedFieldLabels(category);
  const editableProperties = Object.entries(labels).map(([key, label]) => ({
    key,
    label,
    value: null,
    editable: true,
    type: 'text' as const,
  }));

  const readOnlyProperties = useMemo(
    () =>
      Object.entries(labels).map(([key, label]) => ({
        label,
        value: values[key as keyof DocumentSharedFieldValues] || null,
      })),
    [labels, values],
  );

  const editableValues = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(labels).map((key) => [key, values[key as keyof DocumentSharedFieldValues]]),
      ),
    [labels, values],
  );

  if (!editable) {
    return (
      <div className="rounded-md border bg-muted/30 p-3">
        <EntityPropertyList properties={readOnlyProperties} />
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <EditablePropertyList
        properties={editableProperties}
        values={editableValues}
        onChange={(key, value) => onChange?.(key, value)}
      />
    </div>
  );
}
