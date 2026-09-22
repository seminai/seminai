import { InvoiceEntry } from '../../../domain/dtos/invoice-entry.dto';
import { extractDeterministicRows } from '../extraction/deterministic-table-fallback';

type ExtractedInvoiceEntry = Omit<InvoiceEntry, 'productCategory' | 'administrativeStatus'>;

/**
 * Deterministic fallback used when the LLM returns nothing or fails JSON parsing.
 *
 * The new implementation delegates to the shared `deterministic-table-fallback`
 * which is schema-aware: it detects columns by their Italian header aliases
 * (`qta`, `u.m.`, `prezzo`, `totale`, ...) rather than assuming a hard-coded
 * order. We only enrich the rows with best-effort invoice metadata parsed from
 * the surrounding text (header with `FT 123/2024 01/02/2024 | FORNITORE`).
 */
export class InvoiceDeterministicFallbackParser {
  public execute(params: { text: string }): ReadonlyArray<ExtractedInvoiceEntry> {
    const rows = extractDeterministicRows(params.text);
    const metadata = extractInvoiceMetadata(params.text);
    return rows.map((row) => ({
      productName: row.productName,
      registrationNumber: null,
      quantity: row.quantity,
      quantityUnitOfMeasure: row.quantityUnitOfMeasure,
      supplierName: metadata.supplierName,
      supplierVat: null,
      invoiceNumber: metadata.invoiceNumber,
      invoiceDate: metadata.invoiceDate,
      invoiceDueDate: null,
      unitPrice: row.unitPrice,
      totalPrice: row.totalPrice,
      sourceRowIndex: row.sourceRowIndex,
      productCode: row.productCode,
      rawLine: row.rawLine,
      sourceChannel: 'deterministic-fallback',
    }));
  }
}

interface InvoiceMetadata {
  readonly invoiceNumber: string | null;
  readonly invoiceDate: string | null;
  readonly supplierName: string | null;
}

function extractInvoiceMetadata(text: string): InvoiceMetadata {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const globalSupplier = extractGlobalSupplier(lines);
  for (const line of lines) {
    const header = parseInvoiceHeader(line);
    if (header) {
      return {
        invoiceNumber: header.invoiceNumber,
        invoiceDate: header.invoiceDate,
        supplierName: header.supplierName ?? globalSupplier,
      };
    }
  }
  return { invoiceNumber: null, invoiceDate: null, supplierName: globalSupplier };
}

function extractGlobalSupplier(lines: readonly string[]): string | null {
  const supplierLine = lines.find((line) => /^Azienda\s*:/i.test(line));
  if (!supplierLine) return null;
  return supplierLine.replace(/^Azienda\s*:/i, '').trim() || null;
}

function parseInvoiceHeader(line: string): InvoiceMetadata | null {
  const normalized = line.replace(/\s+/g, ' ').trim();
  const headerMatch = normalized.match(
    /(?:\|\s*)?FT\s+([0-9]+\/[0-9]+)\s+([0-9]{2}\/[0-9]{2}\/[0-9]{2,4})(?:\s*\|)?/i,
  );
  if (!headerMatch) return null;
  const parts = normalized
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  const supplierName = parts.length >= 2 ? parts[1] || null : null;
  return {
    invoiceNumber: `FT ${headerMatch[1]}`,
    invoiceDate: toIsoDate(headerMatch[2]),
    supplierName,
  };
}

function toIsoDate(rawDate: string): string | null {
  const match = rawDate.match(/^([0-9]{2})\/([0-9]{2})\/([0-9]{2,4})$/);
  if (!match) return null;
  const day = match[1];
  const month = match[2];
  const year = match[3].length === 2 ? `20${match[3].padStart(2, '0')}` : match[3].padStart(4, '0');
  return `${year}-${month}-${day}`;
}
