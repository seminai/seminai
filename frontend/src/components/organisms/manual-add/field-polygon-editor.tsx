import { useState } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import type { Polygon } from 'geojson';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  MapLocationSearch,
  type MapLocationSelection,
} from '@/components/molecules/map-location-search';
import {
  DrawControl,
  FitToBbox,
  FitToContent,
} from '@/components/organisms/field-polygon-map-controls';
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  ensureLeafletMarkerDefaults,
  ESRI_ATTRIBUTION,
  ESRI_LABELS_URL,
  ESRI_WORLD_IMAGERY_URL,
} from '@/lib/map-config';
import { polygonAreaHa, polygonCentroid } from '@/lib/geo-utils';

ensureLeafletMarkerDefaults();

export interface PolygonMeta {
  readonly areaHa: number | null;
  readonly centroid: { readonly latitude: number; readonly longitude: number } | null;
}

interface FieldPolygonEditorProps {
  readonly polygon: Polygon | null;
  readonly onPolygonChange: (polygon: Polygon | null, meta: PolygonMeta) => void;
  readonly disabled?: boolean;
}

/** Satellite map with polygon draw/edit tools for the manual field creation flow. */
export function FieldPolygonEditor({
  polygon,
  onPolygonChange,
  disabled,
}: FieldPolygonEditorProps) {
  const [searchTarget, setSearchTarget] = useState<MapLocationSelection | null>(null);

  const emitChange = (next: Polygon | null) => {
    if (!next) {
      onPolygonChange(null, { areaHa: null, centroid: null });
      return;
    }
    onPolygonChange(next, { areaHa: polygonAreaHa(next), centroid: polygonCentroid(next) });
  };

  return (
    <div className="flex flex-col gap-2">
      <MapLocationSearch onSelect={setSearchTarget} disabled={disabled} />
      <div className="h-72 w-full overflow-hidden rounded-md border">
        <MapContainer
          center={[DEFAULT_MAP_CENTER[0], DEFAULT_MAP_CENTER[1]]}
          zoom={DEFAULT_MAP_ZOOM}
          className="h-full w-full"
          scrollWheelZoom
        >
          <TileLayer url={ESRI_WORLD_IMAGERY_URL} attribution={ESRI_ATTRIBUTION} />
          <TileLayer url={ESRI_LABELS_URL} />
          <DrawControl polygon={polygon} onChange={emitChange} />
          <FitToBbox target={searchTarget} />
          {polygon && (
            <FitToContent
              polygon={polygon}
              latitude={null}
              longitude={null}
              fallbackCenter={DEFAULT_MAP_CENTER}
              fallbackZoom={DEFAULT_MAP_ZOOM}
            />
          )}
        </MapContainer>
      </div>
      {polygon && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => emitChange(null)}
          disabled={disabled}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Rimuovi perimetro
        </Button>
      )}
    </div>
  );
}
