import { parse } from 'csv-parse/sync';
import { AppError } from '../../../domain/errors/AppError';
import type { CsvExcelRow, ColumnIndexMapping } from './product-import.types';
import { ProductImportColumnMapper } from './ProductImportColumnMapper';
import { parseProductImportExcel } from './product-import-excel-parser';
import {
  detectCsvDelimiter,
  isValidUnitOfMeasure,
  looksLikeNumber,
  normalizeImportNumber,
  normalizeMovementType,
} from './product-import-row-utils';

export class ProductImportFileParser {
  private readonly columnMapper = new ProductImportColumnMapper();

  async parse(fileBuffer: Buffer, fileName: string): Promise<CsvExcelRow[]> {
    const lowerFileName = fileName.toLowerCase();
    if (lowerFileName.endsWith('.csv')) return this.parseCsv(fileBuffer);
    if (lowerFileName.endsWith('.xls') || lowerFileName.endsWith('.xlsx')) {
      return parseProductImportExcel(fileBuffer, this.columnMapper);
    }
    throw AppError.badRequest(
      'Unsupported file type. Please upload CSV or Excel file.',
      'UNSUPPORTED_FILE_TYPE',
    );
  }

  private async parseCsv(fileBuffer: Buffer): Promise<CsvExcelRow[]> {
    const content = fileBuffer.toString('utf-8');
    const delimiter = detectCsvDelimiter(content);
    const rawRows = parse(content, {
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      delimiter,
      quote: '"',
      bom: true,
      ltrim: true,
      rtrim: true,
    }) as string[][];
    if (rawRows.length === 0) return [];
    const headerRow = rawRows[0].map((column) => String(column ?? '').trim());
    const dataRows = rawRows
      .slice(1)
      .filter((row) => row.some((cell) => String(cell ?? '').trim()));
    const mapping = await this.columnMapper.resolve(headerRow, dataRows);
    return dataRows.map((row) => this.mapCsvRow(row, headerRow, mapping, delimiter));
  }

  private mapCsvRow(
    row: string[],
    headerRow: string[],
    mapping: ColumnIndexMapping,
    delimiter: string,
  ): CsvExcelRow {
    const getValue = (index: number) => (index >= 0 && index < row.length ? row[index] : '');
    let quantityValue = getValue(mapping.quantityIdx) || '0';
    let unit = getValue(mapping.unitOfMeasureQuantityIdx);
    let deliveryNoteCode = getValue(mapping.ddtCodeIdx);
    let deliveryNoteDate = getValue(mapping.ddtDateIdx);
    const unitWasSplitDecimal = looksLikeNumber(unit) && isValidUnitOfMeasure(deliveryNoteCode);
    if (delimiter === ',' && looksLikeNumber(quantityValue) && unitWasSplitDecimal) {
      quantityValue = `${quantityValue},${unit}`;
      unit = deliveryNoteCode;
      deliveryNoteCode = deliveryNoteDate;
      deliveryNoteDate = this.findShiftedDate(row, headerRow.length, deliveryNoteDate);
    } else if (delimiter === ',') {
      quantityValue = this.reconstructSplitQuantity(row, mapping, quantityValue);
    }
    return {
      productName: getValue(mapping.productNameIdx),
      sku: getValue(mapping.skuIdx) || undefined,
      registrationNumber: getValue(mapping.registrationNumberIdx) || undefined,
      category: getValue(mapping.categoryIdx) || undefined,
      supplierName: getValue(mapping.supplierNameIdx) || undefined,
      quantity: normalizeImportNumber(quantityValue),
      unitOfMeasureQuantity: unit,
      price: normalizeImportNumber(getValue(mapping.priceIdx) || '0'),
      unitOfMeasurePrice: getValue(mapping.unitOfMeasurePriceIdx) || undefined,
      type: normalizeMovementType(getValue(mapping.typeIdx)),
      ddtCode: deliveryNoteCode,
      ddtDate: deliveryNoteDate,
      invoiceCode: getValue(mapping.invoiceCodeIdx) || undefined,
      invoiceDate: getValue(mapping.invoiceDateIdx) || undefined,
      invoiceDueDate: getValue(mapping.invoiceDueDateIdx) || undefined,
    };
  }

  private findShiftedDate(row: string[], headerLength: number, fallback: string): string {
    if (headerLength < row.length) return row[headerLength];
    const datePattern = /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/;
    return row.slice(headerLength).find((value) => datePattern.test(value.trim())) ?? fallback;
  }

  private reconstructSplitQuantity(
    row: string[],
    mapping: ColumnIndexMapping,
    quantityValue: string,
  ): string {
    const decimalIndex = mapping.quantityIdx + 1;
    const unitIndex = mapping.quantityIdx + 2;
    if (
      mapping.quantityIdx >= 0 &&
      unitIndex < row.length &&
      looksLikeNumber(quantityValue) &&
      looksLikeNumber(row[decimalIndex]) &&
      isValidUnitOfMeasure(row[unitIndex])
    ) {
      return `${quantityValue},${row[decimalIndex]}`;
    }
    return quantityValue;
  }
}
