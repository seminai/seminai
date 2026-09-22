import type { Polygon } from 'geojson';
import { EntityDetailPanel } from '@/components/organisms/entity-detail-panel';
import { FieldPolygonMap } from '@/components/organisms/field-polygon-map';
import type { PropertyItem } from '@/components/molecules/entity-property-list';
import type { EditablePropertyItem } from '@/components/molecules/editable-property-list';

interface FieldDetailPanelProps {
  readonly fieldId: string;
  readonly title: string;
  readonly properties: readonly PropertyItem[];
  readonly editableProperties: readonly EditablePropertyItem[];
  readonly onSave: (data: Record<string, string>) => void;
  readonly isSaving?: boolean;
  readonly polygon: Polygon | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly city: string | null;
  readonly onSavedGeo: () => void;
  readonly onClose: () => void;
}

export function FieldDetailPanel({
  fieldId,
  title,
  properties,
  editableProperties,
  onSave,
  isSaving,
  polygon,
  latitude,
  longitude,
  city,
  onSavedGeo,
  onClose,
}: FieldDetailPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <EntityDetailPanel
        title={title}
        properties={properties}
        editableProperties={editableProperties}
        onSave={onSave}
        isSaving={isSaving}
        onClose={onClose}
      >
        <FieldPolygonMap
          fieldId={fieldId}
          initialPolygon={polygon}
          initialLatitude={latitude}
          initialLongitude={longitude}
          city={city}
          onSaved={onSavedGeo}
        />
      </EntityDetailPanel>
    </div>
  );
}
