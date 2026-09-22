import * as shapefile from 'shapefile';
import proj4 from 'proj4';

proj4.defs(
  'EPSG:3003',
  '+proj=tmerc +lat_0=0 +lon_0=9 +k=0.9996 +x_0=1500000 +y_0=0 ' +
    '+ellps=intl +towgs84=-104.1,-49.1,-9.9,0.971,-2.917,0.714,-11.68 +units=m +no_defs',
);

interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface ShapefileExtractedField {
  name: string;
  coordinates: number[];
  coordinatesGaussBoaga: number[];
  latitude: number | null;
  longitude: number | null;
  polygon: GeoJsonPolygon | null;
  polygonGaussBoaga: GeoJsonPolygon | null;
  gisHa: number | null;
  sauHa: number | null;
  soilType: string | null;
  uso: string | null;
  qualita: string | null;
  inizioConduzione: string | null;
  fineConduzione: string | null;
  nation: string | null;
  region: string | null;
  city: string | null;
  address: string | null;
  sezione: string | null;
  foglio: string | null;
  particella: string | null;
  subalterno: string | null;
  superficieCatastaleMq: number | null;
  cap: string | null;
  variazioneMq: string | null;
  ph: number | null;
  nitrogen: number | null;
  phosphorus: number | null;
  potassium: number | null;
  calcium: number | null;
  magnesium: number | null;
}

export interface ShapefileExtractedProductionUnit {
  name: string;
  cropName: string;
  cropType: string;
  variety: string;
  protocoll: string;
  protectionStructure: string;
  startDate: string | null;
  endDate: string | null;
  destinazioneDiUso: string | null;
  areaHa: number;
  fieldIndex: number;
}

export interface ShapefileExtractionResult {
  fields: ShapefileExtractedField[];
  productionUnits: ShapefileExtractedProductionUnit[];
  diagnostics: {
    totalRecords: number;
    shapeType: string;
    sourceCrs: string;
  };
}

interface ShapefileProperties {
  ID_APPEZZ?: number;
  COD_COLTUR?: string;
  VARIETA?: string;
  MANTENIM?: string;
  BIOLOGICO?: string;
  TIPO_SERRA?: string;
  PROTEZIONE?: string;
  IRRIGA?: string;
  TIPO_IRRIG?: string;
  DESC_SUOLO?: string;
  DESC_DEST?: string;
  DESC_USO?: string;
  DESC_QUALI?: string;
  COD_SUOLO?: string;
  COD_DEST?: string;
  COD_USO?: string;
  COD_QUALI?: string;
  SUP_APPE?: number;
  INIZIO_UTI?: string | Date;
  FINE_UTI?: string | Date;
  INIZIO_CON?: string | Date;
  FINE_CON?: string | Date;
  APPE_SEC?: string;
  [key: string]: unknown;
}

/**
 * Converts a coordinate pair from EPSG:3003 (Gauss-Boaga West) to WGS84.
 */
function toWgs84(x: number, y: number): [number, number] {
  const [lon, lat] = proj4('EPSG:3003', 'EPSG:4326', [x, y]);
  return [lon, lat];
}

/**
 * Converts a polygon ring from EPSG:3003 to WGS84.
 */
function convertRingToWgs84(ring: number[][]): number[][] {
  return ring.map(([x, y]) => {
    const [lon, lat] = toWgs84(x, y);
    return [lon, lat];
  });
}

/**
 * Computes the centroid of a polygon ring (simple average).
 */
function computeCentroid(ring: number[][]): [number, number] {
  const len = ring.length;
  if (len === 0) return [0, 0];
  const sumX = ring.reduce((acc, pt) => acc + pt[0], 0);
  const sumY = ring.reduce((acc, pt) => acc + pt[1], 0);
  return [sumX / len, sumY / len];
}

/**
 * Extracts the crop description from a COD_COLTUR string like "1571 GRANTURCO (MAIS)".
 */
function parseCropCode(codColtur: string | undefined): { code: string; description: string } {
  if (!codColtur) return { code: '', description: '' };
  const trimmed = codColtur.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) return { code: trimmed, description: '' };
  return {
    code: trimmed.substring(0, spaceIndex),
    description: trimmed.substring(spaceIndex + 1).trim(),
  };
}

/**
 * Extracts the text part from a code+description string like "000 NESSUNA VARIETA'".
 */
function parseCodeDescription(value: string | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) return trimmed;
  return trimmed.substring(spaceIndex + 1).trim();
}

/**
 * Parses a date value from shapefile DBF (can be Date object, string YYYYMMDD, or YYYY-MM-DD).
 */
function parseShapefileDate(dateVal: Date | string | undefined | null): string | null {
  if (!dateVal) return null;

  if (dateVal instanceof Date) {
    if (isNaN(dateVal.getTime())) return null;
    const y = dateVal.getFullYear();
    const m = String(dateVal.getMonth() + 1).padStart(2, '0');
    const d = String(dateVal.getDate()).padStart(2, '0');
    if (y === 1970 && m === '01' && d === '01') return null;
    return `${y}-${m}-${d}`;
  }

  const str = String(dateVal);
  const cleaned = str.replace(/-/g, '');
  if (cleaned.length !== 8) return null;
  const year = cleaned.substring(0, 4);
  const month = cleaned.substring(4, 6);
  const day = cleaned.substring(6, 8);
  if (year === '1970' && month === '01' && day === '01') return null;
  return `${year}-${month}-${day}`;
}

/**
 * Determines whether a crop code represents an actual agricultural production
 * (as opposed to non-agricultural land like buildings, ditches, hedges).
 */
const NON_CROP_CODES = new Set([
  '1605', // USO NON AGRICOLO - FABBRICATI
  '1347', // GRUPPI DI ALBERI E BOSCHETTI
  '1257', // SIEPI E FASCE ALBERATE
  '1556', // FOSSATI E CANALI
  '1707', // USO NON AGRICOLO - ALTRO
  '1761', // USO NON AGRICOLO - TARE
  '1763', // MACERI, STAGNI E LAGHETTI
  '1059', // BOSCO
]);

function isProductiveCrop(cropCode: string): boolean {
  return cropCode.length > 0 && !NON_CROP_CODES.has(cropCode);
}

/**
 * Parses shapefile buffers (.shp + .dbf) and extracts Field and ProductionUnit arrays.
 * Coordinates are provided in both WGS84 and EPSG:3003 (Gauss-Boaga West).
 */
export async function parseShapefile(
  shpBuffer: Buffer,
  dbfBuffer: Buffer,
): Promise<ShapefileExtractionResult> {
  const shpArrayBuffer = shpBuffer.buffer.slice(
    shpBuffer.byteOffset,
    shpBuffer.byteOffset + shpBuffer.byteLength,
  );
  const dbfArrayBuffer = dbfBuffer.buffer.slice(
    dbfBuffer.byteOffset,
    dbfBuffer.byteOffset + dbfBuffer.byteLength,
  );

  const geojson = await shapefile.read(
    shpArrayBuffer as ArrayBuffer,
    dbfArrayBuffer as ArrayBuffer,
    { encoding: 'latin1' },
  );

  const fields: ShapefileExtractedField[] = [];
  const productionUnits: ShapefileExtractedProductionUnit[] = [];

  for (const feature of geojson.features) {
    const props = (feature.properties ?? {}) as ShapefileProperties;
    const fieldIndex = fields.length;
    const appezzId = props.ID_APPEZZ ?? fieldIndex + 1;
    const { code: cropCode, description: cropDescription } = parseCropCode(props.COD_COLTUR);

    const fieldName = cropDescription
      ? `Appezzamento ${appezzId} - ${cropDescription}`
      : `Appezzamento ${appezzId}`;

    let polygonWgs84: GeoJsonPolygon | null = null;
    let polygonGB: GeoJsonPolygon | null = null;
    let centroidWgs84: [number, number] = [0, 0];
    let centroidGB: [number, number] = [0, 0];

    if (feature.geometry && feature.geometry.type === 'Polygon') {
      const originalCoords = feature.geometry.coordinates as number[][][];
      polygonGB = { type: 'Polygon', coordinates: originalCoords };
      const wgs84Coords = originalCoords.map(convertRingToWgs84);
      polygonWgs84 = { type: 'Polygon', coordinates: wgs84Coords };
      centroidGB = computeCentroid(originalCoords[0]);
      centroidWgs84 = computeCentroid(wgs84Coords[0]);
    }

    const supAppeHa = props.SUP_APPE ?? null;
    const supAppeMq = supAppeHa != null ? supAppeHa * 10000 : null;

    const extractedField: ShapefileExtractedField = {
      name: fieldName,
      coordinates: centroidWgs84[0] !== 0 ? [centroidWgs84[0], centroidWgs84[1]] : [],
      coordinatesGaussBoaga: centroidGB[0] !== 0 ? [centroidGB[0], centroidGB[1]] : [],
      latitude: centroidWgs84[1] !== 0 ? centroidWgs84[1] : null,
      longitude: centroidWgs84[0] !== 0 ? centroidWgs84[0] : null,
      polygon: polygonWgs84,
      polygonGaussBoaga: polygonGB,
      gisHa: supAppeHa,
      sauHa: supAppeHa,
      soilType: props.DESC_SUOLO?.trim() || null,
      uso: props.DESC_USO?.trim() || null,
      qualita: props.DESC_QUALI?.trim() || null,
      inizioConduzione: parseShapefileDate(props.INIZIO_CON),
      fineConduzione: parseShapefileDate(props.FINE_CON),
      nation: null,
      region: null,
      city: null,
      address: null,
      sezione: null,
      foglio: null,
      particella: null,
      subalterno: null,
      superficieCatastaleMq: supAppeMq,
      cap: null,
      variazioneMq: null,
      ph: null,
      nitrogen: null,
      phosphorus: null,
      potassium: null,
      calcium: null,
      magnesium: null,
    };

    fields.push(extractedField);

    if (isProductiveCrop(cropCode)) {
      const variety = parseCodeDescription(props.VARIETA);
      const biologico = parseCodeDescription(props.BIOLOGICO);
      const protectionStructure = props.TIPO_SERRA?.trim() || props.PROTEZIONE?.trim() || '';

      productionUnits.push({
        name: cropDescription || `Coltura ${cropCode}`,
        cropName: cropDescription,
        cropType: cropCode,
        variety: variety === "NESSUNA VARIETA'" ? '' : variety,
        protocoll: biologico,
        protectionStructure,
        startDate: parseShapefileDate(props.INIZIO_UTI),
        endDate: parseShapefileDate(props.FINE_UTI),
        destinazioneDiUso: props.DESC_DEST?.trim() || null,
        areaHa: supAppeHa ?? 0,
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
      sourceCrs: 'EPSG:3003',
    },
  };
}
