import { useEffect, useRef } from 'react';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { MapContainer, TileLayer, Marker, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icons for bundlers
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface FieldNoteMapProps {
  readonly latitude: number;
  readonly longitude: number;
  readonly polygon?: Polygon | MultiPolygon | null;
}

function FitBounds({ latitude, longitude, polygon }: FieldNoteMapProps) {
  const map = useMap();
  const prevBoundsRef = useRef<string>('');

  useEffect(() => {
    const boundsKey = `${latitude},${longitude},${JSON.stringify(polygon)}`;
    if (boundsKey === prevBoundsRef.current) return;
    prevBoundsRef.current = boundsKey;

    if (polygon) {
      const geoJsonLayer = L.geoJSON(polygon);
      const bounds = geoJsonLayer.getBounds().extend([latitude, longitude]);
      map.fitBounds(bounds, { padding: [30, 30] });
    } else {
      map.setView([latitude, longitude], 15);
    }
  }, [map, latitude, longitude, polygon]);

  return null;
}

export function FieldNoteMap({ latitude, longitude, polygon }: FieldNoteMapProps) {
  const polygonFeature: Feature<Polygon | MultiPolygon> | null = polygon
    ? { type: 'Feature', geometry: polygon, properties: {} }
    : null;

  return (
    <div className="h-[250px] w-full overflow-hidden rounded-md border">
      <MapContainer
        center={[latitude, longitude]}
        zoom={15}
        className="h-full w-full"
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[latitude, longitude]} />
        {polygonFeature && (
          <GeoJSON
            key={JSON.stringify(polygon)}
            data={polygonFeature}
            style={{ color: '#3b82f6', weight: 2, fillOpacity: 0.15 }}
          />
        )}
        <FitBounds latitude={latitude} longitude={longitude} polygon={polygon} />
      </MapContainer>
    </div>
  );
}
