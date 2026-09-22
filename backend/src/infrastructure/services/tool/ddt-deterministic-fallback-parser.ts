import { DdtEntry } from '../../../domain/dtos/ddt-entry.dto';
import { extractDeterministicRows } from '../extraction/deterministic-table-fallback';

type ExtractedDdtEntry = Omit<DdtEntry, 'productCategory'>;

/**
 * Deterministic fallback for DDT extraction.
 *
 * Mirrors the invoice fallback: consumes markdown tables via the shared
 * schema-aware `deterministic-table-fallback`. Useful when the LLM returns an
 * empty array or invalid JSON for a DDT (the previous implementation had NO
 * fallback for DDTs, so a single failing call produced zero products).
 */
export class DdtDeterministicFallbackParser {
  public execute(params: { text: string }): ReadonlyArray<ExtractedDdtEntry> {
    const rows = extractDeterministicRows(params.text);
    const metadata = extractDdtMetadata(params.text);
    return rows.map((row) => ({
      productName: row.productName,
      registrationNumber: null,
      quantity: row.quantity,
      quantityUnitOfMeasure: row.quantityUnitOfMeasure,
      supplierName: metadata.supplierName,
      supplierVat: null,
      ddtDate: metadata.ddtDate,
      orderNumber: metadata.orderNumber,
      unitPrice: row.unitPrice,
      totalPrice: row.totalPrice,
      sourceRowIndex: row.sourceRowIndex,
      productCode: row.productCode,
      rawLine: row.rawLine,
      sourceChannel: 'deterministic-fallback',
    }));
  }
}

interface DdtMetadata {
  readonly ddtDate: string | null;
  readonly orderNumber: string | null;
  readonly supplierName: string | null;
}

const DDT_DATE_LABEL_REGEX =
  /(?:data\s+(?:ddt|documento|di\s+partenza|del\s+documento|del\s+ddt|trasporto))\s*[:\-]?\s*([0-9]{2}\/[0-9]{2}\/[0-9]{2,4})/i;
const DDT_ORDER_LABEL_REGEX =
  /(?:n(?:\.|umero)?\s*(?:ordine|d['’]?\s*ordine|ord\.?)\s*[:\-]?\s*([A-Z0-9\/\-\.]+))/i;

function extractDdtMetadata(text: string): DdtMetadata {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  let ddtDate: string | null = null;
  let orderNumber: string | null = null;
  for (const line of lines) {
    if (!ddtDate) {
      const dateMatch = line.match(DDT_DATE_LABEL_REGEX);
      if (dateMatch) ddtDate = toIsoDate(dateMatch[1]);
    }
    if (!orderNumber) {
      const orderMatch = line.match(DDT_ORDER_LABEL_REGEX);
      if (orderMatch) orderNumber = orderMatch[1].trim();
    }
    if (ddtDate && orderNumber) break;
  }
  const supplierName = extractGlobalSupplier(lines);
  return { ddtDate, orderNumber, supplierName };
}

function extractGlobalSupplier(lines: readonly string[]): string | null {
  const supplierLine = lines.find((line) => /^(Azienda|Fornitore|Mittente)\s*:/i.test(line));
  if (!supplierLine) return null;
  return supplierLine.replace(/^(Azienda|Fornitore|Mittente)\s*:/i, '').trim() || null;
}

function toIsoDate(rawDate: string): string | null {
  const match = rawDate.match(/^([0-9]{2})\/([0-9]{2})\/([0-9]{2,4})$/);
  if (!match) return null;
  const day = match[1];
  const month = match[2];
  const year = match[3].length === 2 ? `20${match[3].padStart(2, '0')}` : match[3].padStart(4, '0');
  return `${year}-${month}-${day}`;
}
