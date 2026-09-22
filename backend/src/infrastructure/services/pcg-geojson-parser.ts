import {
  buildPcgFieldName,
  computeRingCentroid,
  convertRingUtm32ToWgs84,
  isProductivePcgColtura,
  parsePcgDate,
  parsePcgParticelles,
} from './pcg-geojson-utils';
import { resolvePcgCropLabel } from './sisco-crop-lookup';
import type {
  ShapefileExtractedField,
  ShapefileExtractedProductionUnit,
  ShapefileExtractionResult,
} from './shapefile-parser';

interface GeoJsonPolygon {
  readonly type: 'Polygon';
  readonly coordinates: number[][][];
}

interface PcgFeatureProperties {
  readonly cuaa?: string;
  readonly particelle?: string;
  readonly coltura?: string;
  readonly cod_coltura?: string;
  readonly area?: number;
  readonly data_inizio_coltura?: string;
  readonly data_fine_coltura?: string;
  readonly id_poligono?: string;
  readonly id_dichiarazione?: number;
  readonly MANTENIMENTO_SUP_AGRICOLE?: string;
  readonly MANTENIMENTO_PRATI_PERMANENTI?: string;
}

interface PcgGeoJsonFeature {
  readonly type: 'Feature';
  readonly geometry?: {
    readonly type: string;
    readonly coordinates?: number[][][];
  };
  readonly properties?: PcgFeatureProperties;
}

interface PcgGeoJsonCollection {
  readonly type: 'FeatureCollection';
  readonly features: readonly PcgGeoJsonFeature[];
}

function parseGeoJsonBuffer(buffer: Buffer): PcgGeoJsonCollection {
  const parsed = JSON.parse(buffer.toString('utf8')) as PcgGeoJsonCollection;
  if (parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
    throw new Error('Invalid PCG GeoJSON: expected FeatureCollection with features array');
  }
  if (parsed.features.length === 0) {
    throw new Error('PCG GeoJSON contains no features');
  }
  return parsed;
}

function areaMqToHa(areaMq: number | undefined | null): number | null {
  if (areaMq == null || !Number.isFinite(areaMq) || areaMq <= 0) return null;
  return areaMq / 10000;
}

export async function parsePcgGeojson(buffer: Buffer): Promise<ShapefileExtractionResult> {
  const geojson = parseGeoJsonBuffer(buffer);
  const fields: ShapefileExtractedField[] = [];
  const productionUnits: ShapefileExtractedProductionUnit[] = [];

  for (const feature of geojson.features) {
    const props = feature.properties ?? {};
    const fieldIndex = fields.length;
    const cadastral = parsePcgParticelles(props.particelle);
    const crop = resolvePcgCropLabel(props.coltura, props.cod_coltura);
    const areaHa = areaMqToHa(props.area);
    const areaMq = props.area ?? null;

    let polygonWgs84: GeoJsonPolygon | null = null;
    let polygonUtm: GeoJsonPolygon | null = null;
    let centroidWgs84: [number, number] = [0, 0];
    let centroidUtm: [number, number] = [0, 0];

    if (feature.geometry?.type === 'Polygon' && feature.geometry.coordinates) {
      const originalCoords = feature.geometry.coordinates;
      polygonUtm = { type: 'Polygon', coordinates: originalCoords };
      const wgs84Coords = originalCoords.map(convertRingUtm32ToWgs84);
      polygonWgs84 = { type: 'Polygon', coordinates: wgs84Coords };
      centroidUtm = computeRingCentroid(originalCoords[0]);
      centroidWgs84 = computeRingCentroid(wgs84Coords[0]);
    }

    const startDate = parsePcgDate(props.data_inizio_coltura);
    const endDate = parsePcgDate(props.data_fine_coltura);
    const maintenance =
      props.MANTENIMENTO_SUP_AGRICOLE?.trim() || props.MANTENIMENTO_PRATI_PERMANENTI?.trim() || '';

    fields.push({
      name: buildPcgFieldName(
        cadastral?.comune ?? null,
        cadastral?.foglio ?? null,
        cadastral?.particella ?? null,
      ),
      coordinates: centroidWgs84[0] !== 0 ? [centroidWgs84[0], centroidWgs84[1]] : [],
      coordinatesGaussBoaga: centroidUtm[0] !== 0 ? [centroidUtm[0], centroidUtm[1]] : [],
      latitude: centroidWgs84[1] !== 0 ? centroidWgs84[1] : null,
      longitude: centroidWgs84[0] !== 0 ? centroidWgs84[0] : null,
      polygon: polygonWgs84,
      polygonGaussBoaga: polygonUtm,
      gisHa: areaHa,
      sauHa: isProductivePcgColtura(props.coltura) ? areaHa : 0,
      soilType: null,
      uso: crop.uso,
      qualita: maintenance || null,
      inizioConduzione: startDate,
      fineConduzione: endDate,
      nation: 'IT',
      region: 'VENETO',
      city: cadastral?.comune ?? null,
      address: null,
      sezione: null,
      foglio: cadastral?.foglio ?? null,
      particella: cadastral?.particella ?? null,
      subalterno: null,
      superficieCatastaleMq: areaMq,
      cap: null,
      variazioneMq: null,
      ph: null,
      nitrogen: null,
      phosphorus: null,
      potassium: null,
      calcium: null,
      magnesium: null,
    });

    if (isProductivePcgColtura(props.coltura)) {
      productionUnits.push({
        name: crop.cropName || crop.uso,
        cropName: crop.cropName || crop.uso,
        cropType: crop.cropType,
        variety: '',
        protocoll: '',
        protectionStructure: '',
        startDate,
        endDate,
        destinazioneDiUso: null,
        areaHa: areaHa ?? 0,
        fieldIndex,
      });
    }
  }

  return {
    fields,
    productionUnits,
    diagnostics: {
      totalRecords: geojson.features.length,
      shapeType: 'Polygon',
      sourceCrs: 'EPSG:32632',
    },
  };
}
