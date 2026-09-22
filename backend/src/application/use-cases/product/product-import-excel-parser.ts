import * as XLSX from 'xlsx';
import { AppError } from '../../../domain/errors/AppError';
import type { CsvExcelRow } from './product-import.types';
import type { ProductImportColumnMapper } from './ProductImportColumnMapper';
import {
  findHeaderRowIndex,
  isUnitSubHeaderRow,
  normalizeHeaderKey,
  normalizeImportNumber,
  normalizeMovementType,
  selectBestSheet,
} from './product-import-row-utils';

export async function parseProductImportExcel(
  fileBuffer: Buffer,
  columnMapper: ProductImportColumnMapper,
): Promise<CsvExcelRow[]> {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  if (workbook.SheetNames.length === 0) {
    throw AppError.badRequest('Excel file is empty', 'EMPTY_EXCEL_FILE');
  }
  const worksheet = workbook.Sheets[selectBestSheet(workbook)];
  const rawRows = XLSX.utils.sheet_to_json(worksheet, {
    raw: false,
    defval: '',
    header: 1,
  }) as string[][];
  if (rawRows.length === 0) return [];
  const headerRowIndex = findHeaderRowIndex(rawRows);
  if (headerRowIndex < 0) return [];
  const headerRow = rawRows[headerRowIndex].map((column) => String(column ?? '').trim());
  const { dataStartIndex, defaultUnitOfMeasure } = resolveDataStart(
    rawRows,
    headerRowIndex,
    headerRow,
  );
  const dataRows = rawRows
    .slice(dataStartIndex)
    .filter((row) => row.some((cell) => String(cell ?? '').trim()));
  const mapping = await columnMapper.resolve(headerRow, dataRows);

  return dataRows.map((row) => {
    const getValue = (index: number) =>
      index >= 0 && index < row.length ? String(row[index] ?? '') : '';
    let quantityValue = getValue(mapping.quantityIdx);
    if (!quantityValue && mapping.initialStockQuantityIdx >= 0) {
      quantityValue = getValue(mapping.initialStockQuantityIdx);
    }
    const unit = getValue(mapping.unitOfMeasureQuantityIdx) || defaultUnitOfMeasure || 'KG';
    return {
      productName: getValue(mapping.productNameIdx),
      sku: getValue(mapping.skuIdx) || undefined,
      registrationNumber: getValue(mapping.registrationNumberIdx) || undefined,
      category: getValue(mapping.categoryIdx) || undefined,
      supplierName: getValue(mapping.supplierNameIdx) || undefined,
      quantity: normalizeImportNumber(quantityValue || '0'),
      unitOfMeasureQuantity: unit,
      price: normalizeImportNumber(getValue(mapping.priceIdx) || '0'),
      unitOfMeasurePrice: getValue(mapping.unitOfMeasurePriceIdx) || undefined,
      type: normalizeMovementType(getValue(mapping.typeIdx)),
      ddtCode: getValue(mapping.ddtCodeIdx),
      ddtDate: getValue(mapping.ddtDateIdx),
      invoiceCode: getValue(mapping.invoiceCodeIdx) || undefined,
      invoiceDate: getValue(mapping.invoiceDateIdx) || undefined,
      invoiceDueDate: getValue(mapping.invoiceDueDateIdx) || undefined,
    };
  });
}

function resolveDataStart(
  rows: readonly string[][],
  headerRowIndex: number,
  headerRow: readonly string[],
): { dataStartIndex: number; defaultUnitOfMeasure: string } {
  let dataStartIndex = headerRowIndex + 1;
  let defaultUnitOfMeasure = '';
  if (dataStartIndex >= rows.length || !isUnitSubHeaderRow(rows[dataStartIndex])) {
    return { dataStartIndex, defaultUnitOfMeasure };
  }
  const unitRow = rows[dataStartIndex];
  const quantityKeywords = ['quantit', 'giacenz', 'qty'];
  for (let index = 0; index < headerRow.length; index += 1) {
    const header = normalizeHeaderKey(headerRow[index]);
    if (!quantityKeywords.some((keyword) => header.includes(keyword))) continue;
    const value = String(unitRow[index] ?? '')
      .trim()
      .replace(/[()]/g, '');
    if (value) {
      defaultUnitOfMeasure = value;
      break;
    }
  }
  dataStartIndex += 1;
  return { dataStartIndex, defaultUnitOfMeasure };
}
