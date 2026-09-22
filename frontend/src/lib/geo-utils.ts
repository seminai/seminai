import type { Polygon, Position } from 'geojson';

export type LeafletLatLng = readonly [lat: number, lng: number];

export function isGeoJsonPolygon(value: unknown): value is Polygon {
  if (!value || typeof value !== 'object') return false;
  const geo = value as Record<string, unknown>;
  if (geo.type !== 'Polygon') return false;
  if (!Array.isArray(geo.coordinates)) return false;
  const rings = geo.coordinates as unknown[];
  if (rings.length === 0) return false;
  const outer = rings[0];
  if (!Array.isArray(outer) || outer.length < 4) return false;
  return true;
}

export function leafletRingToGeoJson(ring: readonly LeafletLatLng[]): Position[] {
  if (ring.length === 0) return [];
  const positions: Position[] = ring.map(([lat, lng]) => [lng, lat]);
  const first = positions[0];
  const last = positions[positions.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    positions.push([first[0], first[1]]);
  }
  return positions;
}

export function geoJsonRingToLeaflet(ring: readonly Position[]): LeafletLatLng[] {
  if (ring.length === 0) return [];
  const result: LeafletLatLng[] = [];
  for (let i = 0; i < ring.length; i += 1) {
    const point = ring[i];
    if (i === ring.length - 1) {
      const first = ring[0];
      if (point[0] === first[0] && point[1] === first[1]) break;
    }
    result.push([point[1], point[0]] as LeafletLatLng);
  }
  return result;
}

export function makePolygonFromLeafletRing(ring: readonly LeafletLatLng[]): Polygon | null {
  const positions = leafletRingToGeoJson(ring);
  if (positions.length < 4) return null;
  return { type: 'Polygon', coordinates: [positions] };
}

export function polygonCentroid(polygon: Polygon): { latitude: number; longitude: number } | null {
  const outer = polygon.coordinates[0];
  if (!outer || outer.length === 0) return null;
  const points = outer.slice(0, -1).length >= 3 ? outer.slice(0, -1) : outer;
  let sumLng = 0;
  let sumLat = 0;
  for (const [lng, lat] of points) {
    sumLng += lng;
    sumLat += lat;
  }
  const count = points.length;
  if (count === 0) return null;
  return { latitude: sumLat / count, longitude: sumLng / count };
}

export function centroidToCoordinates(centroid: { latitude: number; longitude: number }): number[] {
  return [centroid.longitude, centroid.latitude];
}

const EARTH_MEAN_RADIUS_M = 6371008.8;

/** Geodesic area of the outer ring in hectares (spherical excess, WGS84 mean radius). */
export function polygonAreaHa(polygon: Polygon): number {
  const ring = polygon.coordinates[0];
  if (!ring || ring.length < 4) return 0;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  let total = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[i + 1];
    total += toRad(lng2 - lng1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  const areaMq = Math.abs((total * EARTH_MEAN_RADIUS_M * EARTH_MEAN_RADIUS_M) / 2);
  return Math.round((areaMq / 10000) * 10000) / 10000;
}
