import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

export const ESRI_WORLD_IMAGERY_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export const ESRI_LABELS_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

export const ESRI_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

export const DEFAULT_MAP_CENTER: readonly [number, number] = [42.5, 12.5] as const;
export const DEFAULT_MAP_ZOOM = 6;
export const FIELD_FOCUS_ZOOM = 16;
export const CITY_FALLBACK_ZOOM = 13;

export const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search';

export const VISIBLE_MARKER_ICON = L.divIcon({
  className: '',
  html: [
    '<span style="',
    'display:block;width:18px;height:18px;border-radius:9999px;',
    'background:#2563eb;border:3px solid #ffffff;',
    'box-shadow:0 0 0 2px rgba(37,99,235,0.35),0 8px 18px rgba(0,0,0,0.35);',
    '">',
    '</span>',
  ].join(''),
  iconAnchor: [9, 9],
  iconSize: [18, 18],
});

let markerDefaultsApplied = false;

export function ensureLeafletMarkerDefaults(): void {
  if (markerDefaultsApplied) return;
  delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
  });
  markerDefaultsApplied = true;
}

export const POLYGON_STYLE = {
  color: '#16a34a',
  weight: 2,
  fillOpacity: 0.18,
} as const;
