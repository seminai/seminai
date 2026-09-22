import * as shapefile from 'shapefile';
import proj4 from 'proj4';
import { getVenetoPcgComuneName } from './veneto-pcg-cadastral-code-map';
import {
  normalizePcgCadastralNumber,
  normalizePcgSubalterno,
  parsePcgNumber,
  squareMetersToHectares,
} from './veneto-pcg-number-utils';
import type { VenetoPcgFieldRecord } from './veneto-pcg-types';

proj4.defs(
  'EPSG:3003',
  '+proj=tmerc +lat_0=0 +lon_0=9 +k=0.9996 +x_0=1500000 +y_0=0 ' +
    '+ellps=intl +towgs84=-104.1,-49.1,-9.9,0.971,-2.917,0.714,-11.68 +units=m +no_defs',
);

interface GeoJsonPolygon {
  readonly type: 'Polygon';
  readonly coordinates: number[][][];
}

interface VenetoPcgFieldProperties {
  readonly COD_NAZION?: string;
  readonly FOGLIO?: string | number;
  readonly PARTICELLA?: string | number;
  readonly SUB?: string | number;
  readonly SUPE_CONDO?: string | number;
}

interface VenetoPcgFeature {
  readonly geometry?: { readonly type: string; readonly coordinates?: unknown } | null;
  readonly properties?: VenetoPcgFieldProperties | null;
}

interface VenetoPcgFeatureCollection {
  readonly features: readonly VenetoPcgFeature[];
}

export async function parseVenetoPcgFields(
  shpBuffer: Buffer,
  dbfBuffer: Buffer,
): Promise<readonly VenetoPcgFieldRecord[]> {
  const geojson = (await shapefile.read(toArrayBuffer(shpBuffer), toArrayBuffer(dbfBuffer), {
    encoding: 'latin1',
  })) as VenetoPcgFeatureCollection;
  return geojson.features.map((feature, index) => mapFeature(feature, index));
}

function mapFeature(feature: VenetoPcgFeature, index: number): VenetoPcgFieldRecord {
  const props = feature.properties ?? {};
  const codiceNazionale = String(props.COD_NAZION ?? '')
    .trim()
    .toUpperCase();
  const comune = getVenetoPcgComuneName(codiceNazionale);
  const foglio = normalizePcgCadastralNumber(props.FOGLIO);
  const particella = normalizePcgCadastralNumber(props.PARTICELLA);
  const subalterno = normalizePcgSubalterno(props.SUB);
  const surfaceMq = parsePcgNumber(props.SUPE_CONDO) ?? 0;
  const areaHa = squareMetersToHectares(surfaceMq);
  const polygonGaussBoaga = extractPolygon(feature.geometry);
  const polygon = polygonGaussBoaga ? convertPolygonToWgs84(polygonGaussBoaga) : null;
  const centroidGb = polygonGaussBoaga ? computeCentroid(polygonGaussBoaga.coordinates[0]) : [0, 0];
  const centroidWgs = polygon ? computeCentroid(polygon.coordinates[0]) : [0, 0];
  return {
    codiceNazionale,
    surfaceMq,
    field: {
      name: buildFieldName(comune, foglio, particella, index),
      coordinates: centroidWgs[0] !== 0 ? [centroidWgs[0], centroidWgs[1]] : [],
      coordinatesGaussBoaga: centroidGb[0] !== 0 ? [centroidGb[0], centroidGb[1]] : [],
      latitude: centroidWgs[1] !== 0 ? centroidWgs[1] : null,
      longitude: centroidWgs[0] !== 0 ? centroidWgs[0] : null,
      polygon,
      polygonGaussBoaga,
      gisHa: areaHa,
      sauHa: areaHa,
      soilType: null,
      uso: null,
      qualita: null,
      inizioConduzione: null,
      fineConduzione: null,
      nation: 'IT',
      region: 'VENETO',
      city: comune,
      address: null,
      sezione: null,
      foglio,
      particella,
      subalterno,
      superficieCatastaleMq: surfaceMq || null,
      cap: null,
      variazioneMq: null,
      ph: null,
      nitrogen: null,
      phosphorus: null,
      potassium: null,
      calcium: null,
      magnesium: null,
    },
  };
}

function extractPolygon(geometry: VenetoPcgFeature['geometry']): GeoJsonPolygon | null {
  if (!geometry?.coordinates) return null;
  if (geometry.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geometry.coordinates as number[][][] };
  }
  if (geometry.type === 'MultiPolygon') {
    const polygons = geometry.coordinates as number[][][][];
    const first = polygons[0];
    return first ? { type: 'Polygon', coordinates: first } : null;
  }
  return null;
}

function convertPolygonToWgs84(polygon: GeoJsonPolygon): GeoJsonPolygon {
  return {
    type: 'Polygon',
    coordinates: polygon.coordinates.map((ring) => ring.map(convertPointToWgs84)),
  };
}

function convertPointToWgs84(point: readonly number[]): number[] {
  const [lon, lat] = proj4('EPSG:3003', 'EPSG:4326', [point[0], point[1]]);
  return [lon, lat];
}

function computeCentroid(ring: readonly number[][]): [number, number] {
  if (ring.length === 0) return [0, 0];
  const sumX = ring.reduce((sum, point) => sum + point[0], 0);
  const sumY = ring.reduce((sum, point) => sum + point[1], 0);
  return [sumX / ring.length, sumY / ring.length];
}

function buildFieldName(comune: string, foglio: string, particella: string, index: number): string {
  if (comune && foglio && particella) return `${comune} - F${foglio} P${particella}`;
  return `Campo PCG ${index + 1}`;
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}
