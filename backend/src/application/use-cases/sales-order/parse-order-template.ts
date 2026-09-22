import * as XLSX from 'xlsx';
import { AppError } from '../../../domain/errors/AppError';
import { normalizeKey, normalizeNumber } from '../../../utils/excel-normalize';
import {
  type OrderSourceChannel,
  type StandardOrderDto,
  type StandardOrderLineDto,
} from '../../../domain/dtos/standard-order.dto';

export interface ParseOrderTemplateInput {
  readonly fileBuffer: Buffer;
  readonly fileName: string;
  readonly sourceChannel?: OrderSourceChannel;
}

interface LineColumns {
  readonly product: number;
  readonly vintage: number;
  readonly quantity: number;
  readonly unitPrice: number;
}

const CUSTOMER_NAME_KEYS = ['nome cliente', 'cliente', 'ragione sociale'] as const;
const CUSTOMER_VAT_KEYS = ['p iva', 'partita iva', 'piva', 'vat'] as const;
const NOTES_KEYS = ['note di consegna', 'note', 'consegna'] as const;

function isSpreadsheet(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.xlsx') || lower.endsWith('.xls');
}

function readRows(fileBuffer: Buffer): string[][] {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as unknown[][];
  return raw.map((row) => row.map((cell) => String(cell ?? '').trim()));
}

function extractCustomerField(rows: string[][], keys: readonly string[]): string | null {
  for (const row of rows.slice(0, 8)) {
    if (keys.includes(normalizeKey(row[0] ?? ''))) {
      const value = (row[1] ?? '').trim();
      return value || null;
    }
  }
  return null;
}

function findLinesHeaderIndex(rows: string[][]): number {
  return rows.findIndex((row) => {
    const keys = row.map((cell) => normalizeKey(cell));
    return keys.includes('prodotto') && keys.includes('quantita');
  });
}

function mapLineColumns(headerRow: string[]): LineColumns {
  const find = (test: (key: string) => boolean): number =>
    headerRow.findIndex((cell) => test(normalizeKey(cell)));
  return {
    product: find((key) => key.includes('prodotto')),
    vintage: find((key) => key.includes('annata') || key.includes('vintage')),
    quantity: find((key) => key.includes('quantita')),
    unitPrice: find((key) => key.includes('prezzo')),
  };
}

function parseLine(row: string[], columns: LineColumns): StandardOrderLineDto | null {
  const productName = (row[columns.product] ?? '').trim();
  if (!productName) return null;
  const quantity = normalizeNumber(row[columns.quantity] ?? '');
  if (quantity <= 0) return null;
  const vintageRaw = columns.vintage >= 0 ? normalizeNumber(row[columns.vintage] ?? '') : 0;
  const unitPriceCell = columns.unitPrice >= 0 ? (row[columns.unitPrice] ?? '').trim() : '';
  return {
    productName,
    quantity,
    vintage: vintageRaw > 0 ? Math.trunc(vintageRaw) : null,
    unitPrice: unitPriceCell ? normalizeNumber(unitPriceCell) : null,
  };
}

/** Parses a fixed-column order template (.xlsx) into a normalized `StandardOrderDto`. */
export function parseOrderTemplate(input: ParseOrderTemplateInput): StandardOrderDto {
  if (!isSpreadsheet(input.fileName)) {
    throw AppError.badRequest(
      'Only .xlsx/.xls order templates are supported',
      'UNSUPPORTED_FILE_TYPE',
    );
  }
  const rows = readRows(input.fileBuffer);
  const customerName = extractCustomerField(rows, CUSTOMER_NAME_KEYS);
  if (!customerName) {
    throw AppError.badRequest(
      'Order template is missing the customer name',
      'EMPTY_ORDER_TEMPLATE',
    );
  }
  const headerIndex = findLinesHeaderIndex(rows);
  if (headerIndex < 0) {
    throw AppError.badRequest('Order template lines header not found', 'EMPTY_ORDER_TEMPLATE');
  }
  const columns = mapLineColumns(rows[headerIndex]);
  const lines = rows
    .slice(headerIndex + 1)
    .map((row) => parseLine(row, columns))
    .filter((line): line is StandardOrderLineDto => line !== null);
  if (lines.length === 0) {
    throw AppError.badRequest('Order template has no valid lines', 'EMPTY_ORDER_TEMPLATE');
  }
  return {
    customerName,
    customerVat: extractCustomerField(rows, CUSTOMER_VAT_KEYS),
    deliveryNotesText: extractCustomerField(rows, NOTES_KEYS),
    lines,
    sourceChannel: input.sourceChannel ?? 'template',
  };
}
