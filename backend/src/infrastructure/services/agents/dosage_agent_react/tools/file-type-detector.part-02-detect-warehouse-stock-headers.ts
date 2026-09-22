import AdmZip from 'adm-zip';
import { FileDetectionResult } from './file-type-detector.part-01-csv-excel-file-type';

/**
 * Detects warehouse/stock file by matching headers against known column names
 * from ImportProductsFromCsvExcelUseCase.
 */
export function detectWarehouseStockHeaders(
  headers: string[],
): { confidence: 'high' | 'medium'; reason: string } | null {
  const normalized = headers.map((h) =>
    h
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim(),
  );

  const productNamePatterns = [
    'nome prodotto',
    'nome formulato commerciale',
    'formulato commerciale',
    'prodotto',
    'articolo',
    'descrizione',
    'nome commerciale',
    'fito',
    'nome',
  ];
  const quantityPatterns = [
    'quantita',
    'quantity',
    'qty',
    'qta',
    'giacenza',
    'quantita stock',
    'quantita acquistata',
  ];
  const documentPatterns = [
    'ddt',
    'n ddt',
    'numero ddt',
    'codice ddt',
    'n fattura',
    'numero fattura',
    'n ft',
    'numero documento',
  ];
  const datePatterns = ['data', 'date', 'data ddt', 'data fattura', 'data documento'];
  const supplierPatterns = ['fornitore', 'ditta fornitrice', 'supplier', 'ditta'];

  const hasProduct = productNamePatterns.some((p) =>
    normalized.some((h) => h === p || h.includes(p)),
  );
  const hasQuantity = quantityPatterns.some((p) =>
    normalized.some((h) => h === p || h.includes(p)),
  );
  const hasDocument = documentPatterns.some((p) =>
    normalized.some((h) => h === p || h.includes(p)),
  );
  const hasDate = datePatterns.some((p) => normalized.some((h) => h === p || h.includes(p)));
  const hasSupplier = supplierPatterns.some((p) =>
    normalized.some((h) => h === p || h.includes(p)),
  );

  // Required: product name + quantity + (document OR date)
  if (hasProduct && hasQuantity && (hasDocument || hasDate)) {
    const score = [hasProduct, hasQuantity, hasDocument, hasDate, hasSupplier].filter(
      Boolean,
    ).length;
    return {
      confidence: score >= 4 ? 'high' : 'medium',
      reason: `Warehouse stock headers: product=${hasProduct}, qty=${hasQuantity}, doc=${hasDocument}, date=${hasDate}, supplier=${hasSupplier}`,
    };
  }

  return null;
}

/**
 * Detect whether a ZIP file contains shapefile components (.shp + .dbf).
 * Uses magic bytes check + AdmZip to inspect entries.
 */
export function detectZipType(buffer: Buffer): FileDetectionResult {
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    return { type: 'unknown', confidence: 'low', reason: 'Not a ZIP file (invalid magic bytes)' };
  }

  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    let hasShp = false;
    let hasDbf = false;

    for (const entry of entries) {
      const name = entry.entryName.toLowerCase();
      if (name.endsWith('.shp')) hasShp = true;
      if (name.endsWith('.dbf')) hasDbf = true;
    }

    if (hasShp && hasDbf) {
      return { type: 'shapefile', confidence: 'high', reason: 'ZIP contains .shp and .dbf files' };
    }

    return {
      type: 'unknown',
      confidence: 'low',
      reason: 'ZIP does not contain shapefile components',
    };
  } catch {
    return { type: 'unknown', confidence: 'low', reason: 'Failed to read ZIP archive' };
  }
}

export interface GeoJsonProbe {
  readonly type?: string;
  readonly features?: ReadonlyArray<{ readonly properties?: Record<string, unknown> }>;
}

/**
 * Detect Veneto PCG GeoJSON from buffer content (FeatureCollection with cuaa/particelle).
 */
export function detectGeoJsonType(buffer: Buffer): FileDetectionResult {
  try {
    const parsed = JSON.parse(buffer.toString('utf8')) as GeoJsonProbe;
    if (parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
      return {
        type: 'unknown',
        confidence: 'low',
        reason: 'JSON is not a GeoJSON FeatureCollection',
      };
    }
    const firstProps = parsed.features[0]?.properties ?? {};
    const hasPcgMarkers =
      typeof firstProps.cuaa === 'string' &&
      typeof firstProps.particelle === 'string' &&
      typeof firstProps.coltura === 'string';
    if (hasPcgMarkers) {
      return {
        type: 'piano_colturale',
        confidence: 'high',
        reason: 'GeoJSON contains PCG markers (cuaa, particelle, coltura)',
      };
    }
    return {
      type: 'unknown',
      confidence: 'low',
      reason: 'GeoJSON FeatureCollection without PCG property markers',
    };
  } catch {
    return { type: 'unknown', confidence: 'low', reason: 'Invalid GeoJSON JSON payload' };
  }
}
