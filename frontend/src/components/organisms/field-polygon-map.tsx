import { useCallback, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, Polygon as PolygonLayer } from 'react-leaflet';
import type { Polygon } from 'geojson';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import { Loader2, Pencil, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePutFieldsId } from '@/generated/api/fields/fields';
import { ApiError } from '@/lib/api-client';
import { sanitizeUserFacingText } from '@/lib/safe-display';
import {
  centroidToCoordinates,
  geoJsonRingToLeaflet,
  polygonCentroid,
} from '@/lib/geo-utils';
import {
  CITY_FALLBACK_ZOOM,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  ensureLeafletMarkerDefaults,
  ESRI_ATTRIBUTION,
  ESRI_LABELS_URL,
  ESRI_WORLD_IMAGERY_URL,
  FIELD_FOCUS_ZOOM,
  POLYGON_STYLE,
  VISIBLE_MARKER_ICON,
} from '@/lib/map-config';
import { MapLocationSearch, type MapLocationSelection } from '@/components/molecules/map-location-search';
import { useFieldCenterFallback } from '@/hooks/use-field-center-fallback';
import { DrawControl, FitToBbox, FitToContent } from './field-polygon-map-controls';

ensureLeafletMarkerDefaults();

interface FieldPolygonMapProps {
  readonly fieldId: string;
  readonly initialPolygon: Polygon | null;
  readonly initialLatitude: number | null;
  readonly initialLongitude: number | null;
  readonly city: string | null;
  readonly onSaved: () => void;
}

export function FieldPolygonMap({
  fieldId,
  initialPolygon,
  initialLatitude,
  initialLongitude,
  city,
  onSaved,
}: FieldPolygonMapProps) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [draftPolygon, setDraftPolygon] = useState<Polygon | null>(initialPolygon);
  const [searchTarget, setSearchTarget] = useState<MapLocationSelection | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncedPolygon, setSyncedPolygon] = useState<Polygon | null>(initialPolygon);

  if (mode === 'view' && initialPolygon !== syncedPolygon) {
    setSyncedPolygon(initialPolygon);
    setDraftPolygon(initialPolygon);
  }

  const { mutate: updateField, isPending } = usePutFieldsId<ApiError>();

  const handleEdit = useCallback(() => {
    setDraftPolygon(initialPolygon);
    setErrorMessage(null);
    setMode('edit');
  }, [initialPolygon]);

  const handleCancel = useCallback(() => {
    setDraftPolygon(initialPolygon);
    setSearchTarget(null);
    setErrorMessage(null);
    setMode('view');
  }, [initialPolygon]);

  const handleSave = useCallback(() => {
    if (!draftPolygon) {
      setErrorMessage('Disegna un poligono prima di salvare');
      return;
    }
    const centroid = polygonCentroid(draftPolygon);
    if (!centroid) {
      setErrorMessage('Poligono non valido');
      return;
    }
    setErrorMessage(null);
    updateField(
      {
        id: fieldId,
        data: {
          polygon: draftPolygon,
          latitude: centroid.latitude,
          longitude: centroid.longitude,
          coordinates: centroidToCoordinates(centroid),
        },
      },
      {
        onSuccess: () => {
          setMode('view');
          setSearchTarget(null);
          onSaved();
        },
        onError: (err) => {
          const message =
            err instanceof ApiError
              ? sanitizeUserFacingText(err.message)
              : 'Errore durante il salvataggio del poligono';
          setErrorMessage(message);
        },
      },
    );
  }, [draftPolygon, fieldId, updateField, onSaved]);

  const needsGeocode =
    !initialPolygon && initialLatitude === null && initialLongitude === null && city !== null;
  const {
    data: geocoded,
    isLoading: isGeocodingLoading,
    isError: isGeocodingError,
  } = useFieldCenterFallback(needsGeocode ? city : null);

  const initialCenter = useMemo<[number, number]>(() => {
    if (initialPolygon) {
      const c = polygonCentroid(initialPolygon);
      if (c) return [c.latitude, c.longitude];
    }
    if (initialLatitude !== null && initialLongitude !== null) {
      return [initialLatitude, initialLongitude];
    }
    if (geocoded) {
      return [geocoded.lat, geocoded.lon];
    }
    return [DEFAULT_MAP_CENTER[0], DEFAULT_MAP_CENTER[1]];
  }, [initialPolygon, initialLatitude, initialLongitude, geocoded]);

  const initialZoom = initialPolygon || initialLatitude !== null
    ? FIELD_FOCUS_ZOOM
    : geocoded
      ? CITY_FALLBACK_ZOOM
      : DEFAULT_MAP_ZOOM;

  const showGeocodeMarker = mode === 'view' && needsGeocode && geocoded !== null;
  const showApproxHint = mode === 'view' && needsGeocode && geocoded !== null;
  const showGeocodeFailHint =
    mode === 'view' && needsGeocode && !isGeocodingLoading && (isGeocodingError || geocoded === null);

  const viewPolygonPositions = useMemo<[number, number][] | null>(() => {
    if (mode !== 'view' || !draftPolygon) return null;
    return geoJsonRingToLeaflet(draftPolygon.coordinates[0]).map(([lat, lng]) => [lat, lng]);
  }, [mode, draftPolygon]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Perimetro
        </h3>
        <div className="flex gap-1">
          {mode === 'view' ? (
            <Button variant="ghost" size="sm" onClick={handleEdit}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              Modifica perimetro
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isPending}>
                <X className="mr-1 h-3.5 w-3.5" />
                Annulla
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isPending || !draftPolygon}>
                {isPending ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1 h-3.5 w-3.5" />
                )}
                Salva
              </Button>
            </>
          )}
        </div>
      </div>
      {mode === 'edit' && (
        <MapLocationSearch onSelect={setSearchTarget} disabled={isPending} />
      )}
      {errorMessage && (
        <p className="text-xs text-destructive" role="alert">
          {errorMessage}
        </p>
      )}
      {showApproxHint && (
        <p className="text-xs text-muted-foreground">
          Posizione approssimativa basata sul comune. Disegna il perimetro per maggiore precisione.
        </p>
      )}
      {showGeocodeFailHint && (
        <p className="text-xs text-muted-foreground">
          Impossibile localizzare il comune. Disegna il perimetro o cerca una località.
        </p>
      )}
      <div className="h-[320px] w-full overflow-hidden rounded-md border">
        <MapContainer
          center={initialCenter}
          zoom={initialZoom}
          className="h-full w-full"
          scrollWheelZoom
        >
          <TileLayer url={ESRI_WORLD_IMAGERY_URL} attribution={ESRI_ATTRIBUTION} />
          <TileLayer url={ESRI_LABELS_URL} />
          {viewPolygonPositions && (
            <PolygonLayer positions={viewPolygonPositions} pathOptions={POLYGON_STYLE} />
          )}
          {showGeocodeMarker && geocoded && (
            <Marker icon={VISIBLE_MARKER_ICON} position={[geocoded.lat, geocoded.lon]} />
          )}
          {mode === 'edit' && <DrawControl polygon={draftPolygon} onChange={setDraftPolygon} />}
          {mode === 'edit' && <FitToBbox target={searchTarget} />}
          {mode === 'view' && (
            <FitToContent
              polygon={draftPolygon}
              latitude={initialLatitude}
              longitude={initialLongitude}
              fallbackCenter={DEFAULT_MAP_CENTER}
              fallbackZoom={DEFAULT_MAP_ZOOM}
              fallbackLat={geocoded?.lat ?? null}
              fallbackLon={geocoded?.lon ?? null}
              fallbackBbox={geocoded?.bbox ?? null}
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
}
