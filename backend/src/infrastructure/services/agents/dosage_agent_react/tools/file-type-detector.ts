/**
 * File Type Detector
 *
 * Auto-detects whether an uploaded file contains:
 * - Agricultural data (fields + production units) — regional templates
 * - Warehouse/stock data (products, quantities, DDT/invoices)
 * - Invoice PDF (fattura)
 * - Piano Colturale PDF (AGREA)
 * - Shapefile data (ZIP with .shp + .dbf)
 *
 * Uses existing regional format detectors and ImportProductsFromCsvExcelUseCase
 * header detection logic. Deterministic (no LLM) for CSV/Excel.
 * PDF semantic classification defers to CategoryClassifierService LLM when rules are inconclusive.
 */

import * as XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';
import AdmZip from 'adm-zip';

// Regional format detectors
import { isLombardiaFormat } from '../../../agents/file_agent/template/lombardia_file_structure';
import { isEmiliaRomagnaFormat } from '../../../agents/file_agent/template/emilia_romagna_file_structure';
import { isPiemonteFormat } from '../../../agents/file_agent/template/piemonte_file_structure';
import {
  isVenetoFormat,
  isVenetoAVEPAFormat,
} from '../../../agents/file_agent/template/veneto_file_structure';
import { isCiaSchedarioViticoloFormat } from '../../../agents/file_agent/template/cia_schedario_viticolo_file_structure';

export type CsvExcelFileType = 'agricultural' | 'warehouse_stock' | 'unknown';
export type PdfFileType = 'piano_colturale' | 'invoice' | 'ddt' | 'unknown';
export type ZipFileType = 'shapefile' | 'unknown';

export interface FileDetectionResult {
  type: CsvExcelFileType | PdfFileType | ZipFileType;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

/**
 * Detect whether a CSV/Excel file contains agricultural or warehouse data.
 * Header-based, deterministic, no LLM.
 */
export function detectCsvExcelType(fileBuffer: Buffer): FileDetectionResult {
  const headers = extractHeaders(fileBuffer);
  if (headers.length === 0) {
    return { type: 'unknown', confidence: 'low', reason: 'No headers found' };
  }

  // Step 1: Try regional agricultural format detectors (high confidence)
  if (isEmiliaRomagnaFormat(headers)) {
    return { type: 'agricultural', confidence: 'high', reason: 'Emilia-Romagna AGEA format' };
  }
  if (isLombardiaFormat(headers)) {
    return { type: 'agricultural', confidence: 'high', reason: 'Lombardia format' };
  }
  if (isPiemonteFormat(headers)) {
    return { type: 'agricultural', confidence: 'high', reason: 'Piemonte SATA format' };
  }
  if (isVenetoFormat(headers)) {
    return { type: 'agricultural', confidence: 'high', reason: 'Veneto format' };
  }
  if (isVenetoAVEPAFormat(headers)) {
    return { type: 'agricultural', confidence: 'high', reason: 'Veneto AVEPA format' };
  }
  if (isCiaSchedarioViticoloFormat(headers)) {
    return { type: 'agricultural', confidence: 'high', reason: 'CIA Schedario Viticolo format' };
  }

  // Step 2: Generic agricultural detection (medium confidence)
  if (hasGenericAgriculturalHeaders(headers)) {
    return {
      type: 'agricultural',
      confidence: 'medium',
      reason: 'Generic agricultural headers (foglio + particella)',
    };
  }

  // Step 3: Warehouse/stock detection using ImportProductsFromCsvExcelUseCase header patterns
  const stockDetection = detectWarehouseStockHeaders(headers);
  if (stockDetection) {
    return {
      type: 'warehouse_stock',
      confidence: stockDetection.confidence,
      reason: stockDetection.reason,
    };
  }

  // Step 4: Unknown — CompanyDataExtractorAgent has LLM fallback
  return { type: 'unknown', confidence: 'low', reason: 'No known format detected' };
}

/**
 * Detect PDF type from text content (rule-based fast path only).
 * Piano Colturale AGREA — text-only, never filename-driven.
 * Invoice/DDT require strong multi-pattern signal; ambiguous cases return unknown for LLM routing.
 */
export function detectPdfType(text: string, fileName?: string): FileDetectionResult {
  void fileName;
  const hasPianoColturale = text.includes('PIANO COLTURALE ALFANUMERICO');
  const hasParticellaPattern = /FOGLIO:\s*\d+\s*-\s*PARTICELLA:/i.test(text);
  if (hasPianoColturale || hasParticellaPattern) {
    return {
      type: 'piano_colturale',
      confidence: 'high',
      reason: 'Piano Colturale AGREA detected',
    };
  }

  const invoicePatterns = [
    /fattura/i,
    /FATTURA/,
    /imponibile/i,
    /totale\s+documento/i,
    /partita\s+iva/i,
    /codice\s+fiscale/i,
  ];
  const invoiceScore = invoicePatterns.filter((p) => p.test(text)).length;

  const ddtPatterns = [
    /D\.?D\.?T\.?/i,
    /documento\s+di\s+trasporto/i,
    /bolla\s+di\s+accompagnamento/i,
    /destinazione\s+merce/i,
  ];
  const ddtScore = ddtPatterns.filter((p) => p.test(text)).length;

  if (invoiceScore >= 3) {
    return {
      type: 'invoice',
      confidence: 'high',
      reason: `Invoice patterns matched (${invoiceScore}/6)`,
    };
  }
  if (ddtScore >= 3) {
    return { type: 'ddt', confidence: 'high', reason: `DDT patterns matched (${ddtScore}/4)` };
  }
  if (invoiceScore >= 2) {
    return {
      type: 'invoice',
      confidence: 'medium',
      reason: `Invoice patterns matched (${invoiceScore}/6)`,
    };
  }
  if (ddtScore >= 2) {
    return { type: 'ddt', confidence: 'medium', reason: 'DDT patterns matched' };
  }

  return { type: 'unknown', confidence: 'low', reason: 'No known PDF type detected' };
}

// ── Internal helpers ──

function extractHeaders(fileBuffer: Buffer): string[] {
  // Try XLSX first
  try {
    const wb = XLSX.read(fileBuffer, { type: 'buffer' });
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    if (firstSheet) {
      const data = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1 });
      // Find the first non-empty row with 3+ cells (likely headers)
      for (let i = 0; i < Math.min(data.length, 10); i++) {
        const row = data[i];
        if (row && row.length >= 3) {
          const nonEmpty = row.filter((cell) => String(cell ?? '').trim().length > 0);
          if (nonEmpty.length >= 3) {
            return row.map((cell) => String(cell ?? '').trim());
          }
        }
      }
    }
  } catch {
    // Not Excel, try CSV
  }

  // Try CSV
  try {
    const text = fileBuffer.toString('utf-8');
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return [];

    // Detect separator
    const firstLines = lines.slice(0, 3).join('\n');
    const separators = [';', ',', '\t', '|'] as const;
    let bestSep = ',';
    let bestCount = 0;
    for (const sep of separators) {
      const count = (firstLines.match(new RegExp(`\\${sep}`, 'g')) || []).length;
      if (count > bestCount) {
        bestCount = count;
        bestSep = sep;
      }
    }

    const parsed = parse(lines[0], { delimiter: bestSep, relax_column_count: true }) as string[][];
    if (parsed.length > 0) {
      return parsed[0].map((cell) => String(cell ?? '').trim());
    }
  } catch {
    // Can't parse
  }

  return [];
}

function hasGenericAgriculturalHeaders(headers: string[]): boolean {
  const normalized = headers.map((h) => h.toLowerCase().trim());
  const hasFoglio = normalized.some((h) => h === 'foglio' || h.includes('foglio'));
  const hasParticella = normalized.some((h) => h === 'particella' || h.includes('particella'));
  const hasUnitaProduttiva = normalized.some(
    (h) => h.includes('unita produttiva') || h.includes("unita' produttiva"),
  );
  return (hasFoglio && hasParticella) || hasUnitaProduttiva;
}

/**
 * Detects warehouse/stock file by matching headers against known column names
 * from ImportProductsFromCsvExcelUseCase.
 */
function detectWarehouseStockHeaders(
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

interface GeoJsonProbe {
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
