import { lazy, Suspense, useMemo, useCallback } from 'react';
import { EntityDetailPanel } from '@/components/organisms/entity-detail-panel';
const FieldNoteMap = lazy(() => import('@/components/molecules/field-note-map').then((m) => ({ default: m.FieldNoteMap })));
import type { PropertyItem } from '@/components/molecules/entity-property-list';
import type { EditablePropertyItem, SelectOption } from '@/components/molecules/editable-property-list';
import { usePutFieldNotesId } from '@/generated/api/field-notes/field-notes';
import type { PutFieldNotesIdBody } from '@/generated/schemas/putFieldNotesIdBody';
import { useGetFieldsCompanyCompanyId } from '@/generated/api/fields/fields';
import { useGetProductionUnits } from '@/generated/api/production-units/production-units';
import { useGetProductsMe } from '@/generated/api/products/products';
import { useFieldPolygon } from '@/hooks/use-field-polygon';
import { extractArray } from '@/lib/api-response';
import type { FieldNoteResponse, FieldNoteCategory, FieldNoteStatus } from '@/types/field-note';
import { FIELD_NOTE_CATEGORY_LABELS, FIELD_NOTE_STATUS_LABELS } from '@/types/field-note';

const CATEGORY_OPTIONS: readonly SelectOption[] = Object.entries(FIELD_NOTE_CATEGORY_LABELS).map(
  ([value, label]) => ({ value, label }),
);

const STATUS_OPTIONS: readonly SelectOption[] = Object.entries(FIELD_NOTE_STATUS_LABELS).map(
  ([value, label]) => ({ value, label }),
);

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' });
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

interface FieldNoteDetailPanelProps {
  readonly fieldNote: FieldNoteResponse;
  readonly companyId: string;
  readonly onSaved: () => void;
  readonly onClose: () => void;
}

export function FieldNoteDetailPanel({ fieldNote, companyId, onSaved, onClose }: FieldNoteDetailPanelProps) {
  const { mutate: updateFieldNote, isPending: isSaving } = usePutFieldNotesId();
  const { polygon } = useFieldPolygon(companyId, fieldNote.fieldId);

  const fieldOptions = useFieldOptions(companyId);
  const puOptions = useProductionUnitOptions(companyId);
  const productOptions = useProductOptions(companyId);

  const properties = useMemo<PropertyItem[]>(() => buildProperties(fieldNote), [fieldNote]);

  const editableProperties = useMemo<EditablePropertyItem[]>(
    () => buildEditableProperties(fieldNote, fieldOptions, puOptions, productOptions),
    [fieldNote, fieldOptions, puOptions, productOptions],
  );

  const handleSave = useCallback(
    (data: Record<string, string>) => {
      const payload: PutFieldNotesIdBody & {
        readonly conformityNotes?: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>;
      } = {
        category: data.category as FieldNoteCategory,
        status: data.status as FieldNoteStatus,
        rawContent: data.rawContent,
        notes: data.notes || undefined,
        fieldId: data.fieldId || undefined,
        productionUnitId: data.productionUnitId || undefined,
        productId: data.productId || undefined,
        aiConfidenceScore: data.aiConfidenceScore ? Number(data.aiConfidenceScore) / 100 : undefined,
        conformityNotes: data.conformityNotes ? parseJsonSafe(data.conformityNotes) : undefined,
      };
      updateFieldNote({ id: fieldNote.id, data: payload }, { onSuccess: () => onSaved() });
    },
    [fieldNote.id, updateFieldNote, onSaved],
  );

  const hasCoordinates = fieldNote.latitude != null && fieldNote.longitude != null;

  return (
    <div className="flex h-full flex-col">
      <EntityDetailPanel
        title={truncate(fieldNote.rawContent, 40)}
        properties={properties}
        editableProperties={editableProperties}
        onSave={handleSave}
        isSaving={isSaving}
        onClose={onClose}
      />
      {hasCoordinates && (
        <div className="border-t px-4 py-3">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">Posizione</h3>
          <Suspense fallback={null}>
            <FieldNoteMap
              latitude={fieldNote.latitude!}
              longitude={fieldNote.longitude!}
              polygon={polygon}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}

function buildProperties(fn: FieldNoteResponse): PropertyItem[] {
  return [
    { label: 'Categoria', value: FIELD_NOTE_CATEGORY_LABELS[fn.category] },
    { label: 'Stato', value: FIELD_NOTE_STATUS_LABELS[fn.status] },
    { label: 'Contenuto', value: fn.rawContent },
    { label: 'Data Operazione', value: formatDate(fn.operationDate) },
    { label: 'Campo', value: fn.field?.name },
    { label: 'Unità Produttiva', value: fn.productionUnit?.name },
    { label: 'Prodotto', value: fn.product?.name },
    { label: 'Azienda', value: fn.company?.name },
    { label: 'Latitudine', value: fn.latitude },
    { label: 'Longitudine', value: fn.longitude },
    { label: 'Altitudine', value: fn.altitude },
    { label: 'Precisione GPS', value: fn.gpsAccuracy },
    {
      label: 'Affidabilità AI',
      value: fn.aiConfidenceScore != null ? `${Math.round(fn.aiConfidenceScore * 100)}%` : null,
    },
    { label: 'Note', value: fn.notes },
    {
      label: 'Note di Conformità',
      value: fn.conformityNotes ? JSON.stringify(fn.conformityNotes) : null,
    },
    {
      label: 'Allegati',
      value: fn.attachments.length > 0 ? `${fn.attachments.length} file` : null,
    },
    { label: 'Creato il', value: formatDate(fn.createdAt) },
    { label: 'Aggiornato il', value: formatDate(fn.updatedAt) },
  ];
}

function buildEditableProperties(
  fn: FieldNoteResponse,
  fieldOptions: readonly SelectOption[],
  puOptions: readonly SelectOption[],
  productOptions: readonly SelectOption[],
): EditablePropertyItem[] {
  return [
    { label: 'Categoria', value: fn.category, key: 'category', type: 'select', options: CATEGORY_OPTIONS },
    { label: 'Stato', value: fn.status, key: 'status', type: 'select', options: STATUS_OPTIONS },
    { label: 'Contenuto', value: fn.rawContent, key: 'rawContent', type: 'textarea' },
    { label: 'Note', value: fn.notes, key: 'notes', type: 'textarea' },
    {
      label: 'Campo',
      value: fn.fieldId ?? '',
      key: 'fieldId',
      type: 'select',
      options: [{ value: '', label: '-' }, ...fieldOptions],
    },
    {
      label: 'Unità Produttiva',
      value: fn.productionUnitId ?? '',
      key: 'productionUnitId',
      type: 'select',
      options: [{ value: '', label: '-' }, ...puOptions],
    },
    {
      label: 'Prodotto',
      value: fn.productId ?? '',
      key: 'productId',
      type: 'select',
      options: [{ value: '', label: '-' }, ...productOptions],
    },
    {
      label: 'Affidabilità AI (%)',
      value: fn.aiConfidenceScore != null ? String(Math.round(fn.aiConfidenceScore * 100)) : '',
      key: 'aiConfidenceScore',
      type: 'number',
    },
    {
      label: 'Note di Conformità',
      value: fn.conformityNotes ? JSON.stringify(fn.conformityNotes) : '',
      key: 'conformityNotes',
      type: 'textarea',
    },
    { label: 'Data Operazione', value: formatDate(fn.operationDate), key: 'operationDate', editable: false },
    { label: 'Azienda', value: fn.company?.name, key: 'companyName', editable: false },
    { label: 'Latitudine', value: fn.latitude, key: 'latitude', editable: false },
    { label: 'Longitudine', value: fn.longitude, key: 'longitude', editable: false },
    { label: 'Altitudine', value: fn.altitude, key: 'altitude', editable: false },
    { label: 'Precisione GPS', value: fn.gpsAccuracy, key: 'gpsAccuracy', editable: false },
    { label: 'Allegati', value: fn.attachments.length > 0 ? `${fn.attachments.length} file` : null, key: 'attachments', editable: false },
    { label: 'Creato il', value: formatDate(fn.createdAt), key: 'createdAt', editable: false },
    { label: 'Aggiornato il', value: formatDate(fn.updatedAt), key: 'updatedAt', editable: false },
  ];
}

function useFieldOptions(companyId: string): readonly SelectOption[] {
  const { data: response } = useGetFieldsCompanyCompanyId(companyId, {
    query: { enabled: !!companyId },
  });
  return useMemo(() => {
    if (!response?.data) return [];
    return extractArray(response.data, 'fields').map((f) => {
      const field = f as Record<string, unknown>;
      return { value: String(field.id ?? ''), label: String(field.name ?? '-') };
    });
  }, [response]);
}

function useProductionUnitOptions(companyId: string): readonly SelectOption[] {
  const { data: response } = useGetProductionUnits();
  return useMemo(() => {
    if (!response?.data) return [];
    return extractArray(response.data, 'productionUnits')
      .filter((pu) => {
        const unit = pu as Record<string, unknown>;
        const company = unit.company as Record<string, unknown> | null;
        return company?.id === companyId;
      })
      .map((pu) => {
        const unit = pu as Record<string, unknown>;
        return { value: String(unit.id ?? ''), label: String(unit.name ?? '-') };
      });
  }, [response, companyId]);
}

function useProductOptions(companyId: string): readonly SelectOption[] {
  const { data: response } = useGetProductsMe();
  return useMemo(() => {
    if (!response?.data) return [];
    return extractArray(response.data, 'products')
      .filter((p) => {
        const product = p as Record<string, unknown>;
        const warehouse = product.warehouse as Record<string, unknown> | null;
        const company = warehouse?.company as Record<string, unknown> | null;
        return company?.id === companyId;
      })
      .map((p) => {
        const product = p as Record<string, unknown>;
        return { value: String(product.id ?? ''), label: String(product.name ?? '-') };
      });
  }, [response, companyId]);
}

function parseJsonSafe(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}
