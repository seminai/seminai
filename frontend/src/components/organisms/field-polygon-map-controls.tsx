import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw';
import type { Polygon } from 'geojson';
import {
  geoJsonRingToLeaflet,
  makePolygonFromLeafletRing,
  type LeafletLatLng,
} from '@/lib/geo-utils';
import { CITY_FALLBACK_ZOOM, POLYGON_STYLE } from '@/lib/map-config';
import type { MapLocationSelection } from '@/components/molecules/map-location-search';

export function FitToBbox({ target }: { readonly target: MapLocationSelection | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    const bounds = L.latLngBounds(
      [target.bbox[0], target.bbox[2]],
      [target.bbox[1], target.bbox[3]],
    );
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [map, target]);
  return null;
}

interface DrawControlProps {
  readonly polygon: Polygon | null;
  readonly onChange: (polygon: Polygon | null) => void;
}

export function DrawControl({ polygon, onChange }: DrawControlProps) {
  const map = useMap();
  const groupRef = useRef<L.FeatureGroup | null>(null);
  const controlRef = useRef<L.Control.Draw | null>(null);
  const onChangeRef = useRef(onChange);
  const hasPolygon = polygon !== null;

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const group = new L.FeatureGroup();
    map.addLayer(group);
    groupRef.current = group;

    const handleCreated = (event: L.LeafletEvent) => {
      const layer = (event as L.DrawEvents.Created).layer as L.Polygon;
      group.clearLayers();
      group.addLayer(layer);
      const ring = (layer.getLatLngs()[0] as L.LatLng[]).map(
        (p) => [p.lat, p.lng] as LeafletLatLng,
      );
      onChangeRef.current(makePolygonFromLeafletRing(ring));
    };

    const handleEdited = (event: L.LeafletEvent) => {
      const layers = (event as L.DrawEvents.Edited).layers;
      layers.eachLayer((layer) => {
        const ring = ((layer as L.Polygon).getLatLngs()[0] as L.LatLng[]).map(
          (p) => [p.lat, p.lng] as LeafletLatLng,
        );
        onChangeRef.current(makePolygonFromLeafletRing(ring));
      });
    };

    map.on(L.Draw.Event.CREATED, handleCreated);
    map.on(L.Draw.Event.EDITED, handleEdited);

    return () => {
      map.off(L.Draw.Event.CREATED, handleCreated);
      map.off(L.Draw.Event.EDITED, handleEdited);
      map.removeLayer(group);
      groupRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    if (polygon) {
      const ring = geoJsonRingToLeaflet(polygon.coordinates[0]);
      const layer = L.polygon(
        ring.map(([lat, lng]) => L.latLng(lat, lng)),
        POLYGON_STYLE,
      );
      group.addLayer(layer);
    }
  }, [polygon]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const control = new L.Control.Draw({
      position: 'topright',
      draw: {
        polygon: hasPolygon
          ? false
          : {
              shapeOptions: POLYGON_STYLE,
              allowIntersection: false,
              showArea: true,
            },
        rectangle: false,
        polyline: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: {
        featureGroup: group,
        remove: false,
        edit: hasPolygon ? undefined : false,
      },
    });
    map.addControl(control);
    controlRef.current = control;
    return () => {
      map.removeControl(control);
      controlRef.current = null;
    };
  }, [map, hasPolygon]);

  return null;
}

interface FitToContentProps {
  readonly polygon: Polygon | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly fallbackCenter: readonly [number, number];
  readonly fallbackZoom: number;
  readonly fallbackLat?: number | null;
  readonly fallbackLon?: number | null;
  readonly fallbackBbox?: readonly [number, number, number, number] | null;
}

export function FitToContent({
  polygon,
  latitude,
  longitude,
  fallbackCenter,
  fallbackZoom,
  fallbackLat = null,
  fallbackLon = null,
  fallbackBbox = null,
}: FitToContentProps) {
  const map = useMap();
  const lastKey = useRef<string>('');

  useEffect(() => {
    const key = `${JSON.stringify(polygon)}|${latitude}|${longitude}|${fallbackLat}|${fallbackLon}|${JSON.stringify(fallbackBbox)}`;
    if (key === lastKey.current) return;
    lastKey.current = key;

    if (polygon) {
      const layer = L.geoJSON(polygon);
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30] });
        return;
      }
    }
    if (latitude !== null && longitude !== null) {
      map.setView([latitude, longitude], 16);
      return;
    }
    if (fallbackBbox) {
      const bounds = L.latLngBounds(
        [fallbackBbox[0], fallbackBbox[2]],
        [fallbackBbox[1], fallbackBbox[3]],
      );
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30] });
        return;
      }
    }
    if (fallbackLat !== null && fallbackLon !== null) {
      map.setView([fallbackLat, fallbackLon], CITY_FALLBACK_ZOOM);
      return;
    }
    map.setView([fallbackCenter[0], fallbackCenter[1]], fallbackZoom);
  }, [map, polygon, latitude, longitude, fallbackCenter, fallbackZoom, fallbackLat, fallbackLon, fallbackBbox]);

  return null;
}
