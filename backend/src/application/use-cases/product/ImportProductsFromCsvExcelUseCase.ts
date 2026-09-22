// import { PrismaClient } from '@prisma/client';
import { ProductCategory } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { Product } from '../../../domain/entities/Product';
import { Stock } from '../../../domain/entities/Stock';
import { Warehouse } from '../../../domain/entities/Warehouse';
import { IProductRepository } from '../../../domain/repositories/IProductRepository';
import { IStockRepository } from '../../../domain/repositories/IStockRepository';
import { IWarehouseRepository } from '../../../domain/repositories/IWarehouseRepository';
import { parseDate } from '../../../infrastructure/utils/date.util';
import { convertQuantityToCanonicalUnit } from '../../../infrastructure/utils/quantityConversion';
import { normalizeDdtCode } from '../../../infrastructure/utils/stock.util';
import * as XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { mapToProductCategory } from './product-category.mapper';
import { FitosanitariLookupService } from '../../../infrastructure/services/utils/FitosanitariLookupService';
import { ProductRegistrationLookupService } from '../../../infrastructure/services/utils/ProductRegistrationLookup';
import { createChatModel } from '../../../infrastructure/services/llm-model-factory';
import { hasChatLlmApiKey } from '../../../infrastructure/services/llm-config';

interface CsvExcelRow {
  productName: string;
  sku?: string;
  registrationNumber?: string;
  category?: string;
  supplierName?: string;
  quantity: number;
  unitOfMeasureQuantity: string;
  price?: number;
  unitOfMeasurePrice?: string;
  type?: 'IN' | 'OUT';
  ddtCode: string;
  ddtDate: string;
  invoiceCode?: string;
  invoiceDate?: string;
  invoiceDueDate?: string;
}

interface ImportProductsFromCsvExcelDTO {
  companyId: string;
  warehouseId?: string;
  sourceFileId?: string;
  fileBuffer: Buffer;
  fileName: string;
  preview?: boolean;
}

interface ProductImportPreview {
  name: string;
  sku?: string;
  barcode: string | null;
  category: string;
  type: string;
  description: string | null;
  registrationNumber: string | null;
  stock: {
    quantity: number;
    unitOfMeasureQuantity: string;
    price: number;
    unitOfMeasurePrice: string;
    type: 'IN' | 'OUT';
    ddtCode: string;
    ddtDate: string;
    invoiceCode: string | null;
    invoiceDate: string | null;
    invoiceDueDate: string | null;
    companySupplierName: string | null;
    addressSupplier: string | null;
    vatNumberSupplier: string | null;
  };
}

interface ImportResult {
  productsCreated: number;
  productsUpdated: number;
  stocksCreated: number;
  errors: string[];
  productIds: string[];
  previewProducts?: ProductImportPreview[];
}

const ColumnMappingSchema = z.object({
  productName: z
    .string()
    .nullable()
    .describe('Header name for product name (es: "Nome prodotto", "Fito", "Prodotto")'),
  sku: z.string().nullable().describe('Header name for SKU (optional)'),
  registrationNumber: z
    .string()
    .nullable()
    .describe(
      'Header name for product registration number (es: "Numero registrazione", "N. Reg.", "Registration Number")',
    ),
  category: z
    .string()
    .nullable()
    .describe('Header name for product category (es: "Categoria", "Tipo prodotto", "Category")'),
  quantity: z.string().nullable().describe('Header name for stock quantity'),
  unitOfMeasureQuantity: z.string().nullable().describe('Header name for stock unit of measure'),
  price: z.string().nullable().describe('Header name for stock price'),
  unitOfMeasurePrice: z.string().nullable().describe('Header name for stock price unit'),
  type: z.string().nullable().describe('Header name for stock movement type (IN/OUT)'),
  supplierName: z
    .string()
    .nullable()
    .describe('Header name for supplier/company name (es: "Ditta fornitrice", "Fornitore")'),
  ddtCode: z.string().nullable().describe('Header name for DDT code/number'),
  ddtDate: z.string().nullable().describe('Header name for DDT date'),
  invoiceCode: z
    .string()
    .nullable()
    .describe('Header name for invoice number (es: "N. Ft.", "Numero fattura")'),
  invoiceDate: z.string().nullable().describe('Header name for invoice date'),
  invoiceDueDate: z.string().nullable().describe('Header name for invoice due date'),
});

type ColumnMapping = z.infer<typeof ColumnMappingSchema>;

interface ColumnIndexMapping {
  productNameIdx: number;
  skuIdx: number;
  registrationNumberIdx: number;
  categoryIdx: number;
  supplierNameIdx: number;
  quantityIdx: number;
  unitOfMeasureQuantityIdx: number;
  priceIdx: number;
  unitOfMeasurePriceIdx: number;
  typeIdx: number;
  ddtCodeIdx: number;
  ddtDateIdx: number;
  invoiceCodeIdx: number;
  invoiceDateIdx: number;
  invoiceDueDateIdx: number;
  initialStockQuantityIdx: number;
}

export class ImportProductsFromCsvExcelUseCase {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    // private readonly prisma: PrismaClient,
    private readonly productRepository: IProductRepository,
    private readonly stockRepository: IStockRepository,
    private readonly warehouseRepository: IWarehouseRepository,
  ) {}

  /**
   * Normalizes a numeric string to a decimal number.
   * Handles both Italian format (comma as decimal separator) and English format (dot as decimal separator).
   * Also handles thousand separators (dots or spaces).
   * Examples:
   * - "2400,5" -> 2400.5
   * - "2400.5" -> 2400.5
   * - "2.400,5" -> 2400.5 (Italian format with thousand separator)
   * - "2,400.5" -> 2400.5 (English format with thousand separator)
   * - "0,3" -> 0.3
   * - "0.3" -> 0.3
   */
  private normalizeNumber(value: string | number): number {
    if (typeof value === 'number') {
      return Number.isNaN(value) ? 0 : value;
    }

    if (!value || typeof value !== 'string') {
      return 0;
    }

    const trimmed = String(value).trim();
    if (!trimmed) {
      return 0;
    }

    const hasComma = trimmed.includes(',');
    const hasDot = trimmed.includes('.');

    let normalized = trimmed;

    if (hasComma && hasDot) {
      const lastCommaIndex = trimmed.lastIndexOf(',');
      const lastDotIndex = trimmed.lastIndexOf('.');
      if (lastCommaIndex > lastDotIndex) {
        normalized = trimmed.replace(/\./g, '').replace(',', '.');
      } else {
        normalized = trimmed.replace(/,/g, '');
      }
    } else if (hasComma) {
      normalized = trimmed.replace(/\./g, '').replace(',', '.');
    } else if (hasDot) {
      normalized = trimmed.replace(/,/g, '');
    }

    normalized = normalized.replace(/\s/g, '');

    const parsed = parseFloat(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private normalizeHeaderKey(value: string): string {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private buildHeaderIndexMap(headerRow: string[]): Map<string, number> {
    const headerIndexMap = new Map<string, number>();
    headerRow.forEach((col, idx) => {
      const normalized = this.normalizeHeaderKey(col);
      if (!normalized) return;
      if (!headerIndexMap.has(normalized)) {
        headerIndexMap.set(normalized, idx);
      }
    });
    return headerIndexMap;
  }

  private findColumnIndex(headerIndexMap: Map<string, number>, possibleNames: string[]): number {
    for (const name of possibleNames) {
      const normalized = this.normalizeHeaderKey(name);
      const idx = headerIndexMap.get(normalized);
      if (idx !== undefined) return idx;
    }
    return -1;
  }

  private resolveIndexFromHeaderName(
    headerIndexMap: Map<string, number>,
    headerName?: string | null,
  ): number {
    if (!headerName) return -1;
    const normalized = this.normalizeHeaderKey(headerName);
    if (!normalized) return -1;
    return headerIndexMap.get(normalized) ?? -1;
  }

  private getDefaultColumnIndexMapping(headerIndexMap: Map<string, number>): ColumnIndexMapping {
    return {
      productNameIdx: this.findColumnIndex(headerIndexMap, [
        'nome prodotto',
        'nome prodotto fitosanitario',
        'nome formulato commerciale',
        'nome formulato commerciale o refluo zootecnico',
        'formulato commerciale',
        'product_name',
        'product name',
        'productname',
        'nome',
        'name',
        'fito',
        'prodotto',
        'articolo',
        'descrizione',
      ]),
      skuIdx: this.findColumnIndex(headerIndexMap, [
        'sku',
        'id',
        'codice prodotto',
        'codice articolo',
        'product code',
        'product id',
      ]),
      registrationNumberIdx: this.findColumnIndex(headerIndexMap, [
        'numero registrazione',
        'n registrazione',
        'num registrazione',
        'registration number',
        'registrationNumber',
        'n. reg.',
        'n reg',
        'reg. n.',
      ]),
      categoryIdx: this.findColumnIndex(headerIndexMap, [
        'categoria',
        'category',
        'tipo prodotto',
        'product category',
      ]),
      supplierNameIdx: this.findColumnIndex(headerIndexMap, [
        'ditta fornitrice',
        'fornitore',
        'supplier',
        'ditta',
        'ragione sociale fornitore',
      ]),
      quantityIdx: this.findColumnIndex(headerIndexMap, [
        'quantita stock',
        'quantita fattura',
        'quantita acquistata',
        'quantità stock',
        'quantità fattura',
        'quantità acquistata',
        'quantita',
        'quantità',
        'quantity',
        'qty',
        'qta',
        'giacenza',
      ]),
      unitOfMeasureQuantityIdx: this.findColumnIndex(headerIndexMap, [
        'unita di misura stock',
        'unita di misura',
        'unit_of_measure',
        'unit of measure',
        'unitofmeasure',
        'um',
        'u.m.',
        'u m',
        'unita',
        'unità',
        'udm',
        'uom',
      ]),
      priceIdx: this.findColumnIndex(headerIndexMap, [
        'prezzo',
        'price',
        'prezzo unitario',
        'unit price',
        'costo unitario',
        'prezzo acquisto',
        'prezzo vendita',
      ]),
      unitOfMeasurePriceIdx: this.findColumnIndex(headerIndexMap, [
        'unita di misura prezzo',
        'unita prezzo',
        'unit of measure price',
        'price unit',
        'udm prezzo',
        'uom price',
      ]),
      typeIdx: this.findColumnIndex(headerIndexMap, [
        'tipo movimento',
        'movement type',
        'tipo',
        'stock type',
        'direzione',
      ]),
      ddtCodeIdx: this.findColumnIndex(headerIndexMap, [
        'codice ddt',
        'ddt_code',
        'ddt code',
        'ddtcode',
        'ddt',
        'n ddt',
        'numero ddt',
        'n. ddt',
        'numero documento',
        'n documento',
        'codice',
      ]),
      ddtDateIdx: this.findColumnIndex(headerIndexMap, [
        'data ddt',
        'data d.d.t.',
        'data d d t',
        'ddt date',
        'ddt_date',
        'dataddt',
        'ddtdata',
        'data documento',
        'data',
        'date',
      ]),
      invoiceCodeIdx: this.findColumnIndex(headerIndexMap, [
        'n ft',
        'n. ft.',
        'n ft.',
        'numero fattura',
        'n fattura',
        'invoice number',
        'invoice_number',
        'codice fattura',
      ]),
      invoiceDateIdx: this.findColumnIndex(headerIndexMap, [
        'data fattura',
        'data fatt',
        'data fatt.',
        'invoice date',
        'invoice_date',
        'data documento',
      ]),
      invoiceDueDateIdx: this.findColumnIndex(headerIndexMap, [
        'scadenza fattura',
        'invoice due date',
        'invoice_due_date',
        'data scadenza',
        'scadenza',
      ]),
      initialStockQuantityIdx: this.findColumnIndex(headerIndexMap, [
        'giacenza iniziale',
        'giacenza inizio',
        'stock iniziale',
        'rimanenza iniziale',
      ]),
    };
  }

  private hasRequiredColumns(mapping: ColumnIndexMapping): boolean {
    const hasProductAndQuantity =
      mapping.productNameIdx >= 0 &&
      (mapping.quantityIdx >= 0 || mapping.initialStockQuantityIdx >= 0);
    const hasDocReference =
      mapping.ddtCodeIdx >= 0 || mapping.invoiceCodeIdx >= 0 || mapping.ddtDateIdx >= 0;
    const hasDate = mapping.ddtDateIdx >= 0 || mapping.invoiceDateIdx >= 0;
    return hasProductAndQuantity && hasDocReference && hasDate;
  }

  private async classifyColumnsWithLlm(
    headers: string[],
    sampleRows: string[][],
  ): Promise<ColumnMapping> {
    if (!hasChatLlmApiKey()) {
      throw new Error('OPENROUTER_API_KEY is required to classify import columns');
    }

    const { model } = createChatModel({
      modelName: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 500,
    });

    const structuredModel = model.withStructuredOutput(ColumnMappingSchema);

    const systemPrompt = `Sei un assistente che mappa le intestazioni di un file CSV/Excel per importare prodotti e movimenti di magazzino.
Devi associare le colonne disponibili ai campi richiesti per l'import:
- productName: nome prodotto (es: "Nome prodotto", "Fito", "Prodotto", "Nome prodotto fitosanitario", "Nome formulato commerciale")
- quantity: quantita stock o acquistata (es: "Quantità", "Quantita' fattura", "Quantita' acquistata", valori numerici)
- unitOfMeasureQuantity: unita di misura stock (es: KG, L, LT, PZ, UM)
- price: prezzo unitario del movimento (numero)
- unitOfMeasurePrice: unita di misura del prezzo (es: EUR, EUR/kg)
- type: tipo movimento magazzino (IN o OUT)
- supplierName: nome ditta fornitrice (es: "Ditta fornitrice", "Fornitore")
- ddtCode: codice o numero DDT (non fattura)
- ddtDate: data DDT (non fattura)
- invoiceCode: numero fattura (es: "N. Ft.", "Numero fattura")
- invoiceDate: data fattura (es: "Data fatt.", "Data fattura")
- invoiceDueDate: data scadenza fattura
- sku: SKU o codice prodotto (opzionale)
- registrationNumber: numero di registrazione del prodotto fitosanitario (opzionale)
- category: categoria del prodotto (es: fitosanitario, concime, semente - opzionale)

Regole:
- Usa ESATTAMENTE una delle intestazioni fornite.
- Se una colonna non esiste, restituisci null.
- Non inventare dati.
- Se non c'e' un DDT ma c'e' una fattura, usa invoiceCode e invoiceDate.`;

    const userPrompt = `Headers disponibili:
${JSON.stringify(headers)}

Esempi righe (prime righe, stesso ordine colonne):
${JSON.stringify(sampleRows)}`;

    const result = await structuredModel.invoke([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    return result as ColumnMapping;
  }

  private async resolveColumnIndexMapping(
    headerRow: string[],
    dataRows: string[][],
  ): Promise<ColumnIndexMapping> {
    const headerIndexMap = this.buildHeaderIndexMap(headerRow);
    const defaultMapping = this.getDefaultColumnIndexMapping(headerIndexMap);

    if (headerIndexMap.size === 0 || this.hasRequiredColumns(defaultMapping)) {
      return defaultMapping;
    }

    const sampleRows = dataRows
      .filter((row) => row.some((cell) => String(cell ?? '').trim()))
      .slice(0, 10)
      .map((row) => row.map((cell) => String(cell ?? '').trim()));

    try {
      const llmMapping = await this.classifyColumnsWithLlm(headerRow, sampleRows);
      const pickIndex = (preferred: number, fallback: number): number =>
        preferred >= 0 ? preferred : fallback;

      return {
        productNameIdx: pickIndex(
          this.resolveIndexFromHeaderName(headerIndexMap, llmMapping.productName),
          defaultMapping.productNameIdx,
        ),
        skuIdx: pickIndex(
          this.resolveIndexFromHeaderName(headerIndexMap, llmMapping.sku),
          defaultMapping.skuIdx,
        ),
        registrationNumberIdx: pickIndex(
          this.resolveIndexFromHeaderName(headerIndexMap, llmMapping.registrationNumber),
          defaultMapping.registrationNumberIdx,
        ),
        categoryIdx: pickIndex(
          this.resolveIndexFromHeaderName(headerIndexMap, llmMapping.category),
          defaultMapping.categoryIdx,
        ),
        supplierNameIdx: pickIndex(
          this.resolveIndexFromHeaderName(headerIndexMap, llmMapping.supplierName),
          defaultMapping.supplierNameIdx,
        ),
        quantityIdx: pickIndex(
          this.resolveIndexFromHeaderName(headerIndexMap, llmMapping.quantity),
          defaultMapping.quantityIdx,
        ),
        unitOfMeasureQuantityIdx: pickIndex(
          this.resolveIndexFromHeaderName(headerIndexMap, llmMapping.unitOfMeasureQuantity),
          defaultMapping.unitOfMeasureQuantityIdx,
        ),
        priceIdx: pickIndex(
          this.resolveIndexFromHeaderName(headerIndexMap, llmMapping.price),
          defaultMapping.priceIdx,
        ),
        unitOfMeasurePriceIdx: pickIndex(
          this.resolveIndexFromHeaderName(headerIndexMap, llmMapping.unitOfMeasurePrice),
          defaultMapping.unitOfMeasurePriceIdx,
        ),
        typeIdx: pickIndex(
          this.resolveIndexFromHeaderName(headerIndexMap, llmMapping.type),
          defaultMapping.typeIdx,
        ),
        ddtCodeIdx: pickIndex(
          this.resolveIndexFromHeaderName(headerIndexMap, llmMapping.ddtCode),
          defaultMapping.ddtCodeIdx,
        ),
        ddtDateIdx: pickIndex(
          this.resolveIndexFromHeaderName(headerIndexMap, llmMapping.ddtDate),
          defaultMapping.ddtDateIdx,
        ),
        invoiceCodeIdx: pickIndex(
          this.resolveIndexFromHeaderName(headerIndexMap, llmMapping.invoiceCode),
          defaultMapping.invoiceCodeIdx,
        ),
        invoiceDateIdx: pickIndex(
          this.resolveIndexFromHeaderName(headerIndexMap, llmMapping.invoiceDate),
          defaultMapping.invoiceDateIdx,
        ),
        invoiceDueDateIdx: pickIndex(
          this.resolveIndexFromHeaderName(headerIndexMap, llmMapping.invoiceDueDate),
          defaultMapping.invoiceDueDateIdx,
        ),
        initialStockQuantityIdx: defaultMapping.initialStockQuantityIdx,
      };
    } catch {
      return defaultMapping;
    }
  }

  private findFirstNonEmptyRowIndex(rows: string[][]): number {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].some((cell) => String(cell ?? '').trim())) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Determines if a row looks like a unit sub-header (e.g., "Kg o Lt", "Ha", "EUR/kg-Lt").
   */
  private isUnitSubHeaderRow(row: string[]): boolean {
    const nonEmpty = row.filter((c) => String(c ?? '').trim().length > 0);
    if (nonEmpty.length < 2) return false;
    const unitPattern = /^[\(\)]?[a-zà-ü\s\/\-\.€0-9]+[\(\)]?$/i;
    return nonEmpty.every((c) => {
      const s = String(c).trim();
      return s.length < 30 && unitPattern.test(s);
    });
  }

  /**
   * Finds the header row in an Excel sheet by looking for a row with
   * multiple text-like cells (not just a title or unit sub-header).
   */
  private findHeaderRowIndex(rows: string[][]): number {
    const maxScan = Math.min(rows.length, 15);
    for (let i = 0; i < maxScan; i++) {
      const row = rows[i];
      const nonEmptyCells = row.filter((cell) => String(cell ?? '').trim().length > 0);

      // Header rows typically have 4+ columns
      if (nonEmptyCells.length < 4) continue;

      // Check if cells look like headers: short text, not all numbers
      const textCells = nonEmptyCells.filter((cell) => {
        const str = String(cell).trim();
        return str.length > 0 && str.length < 60 && !/^\d+([.,]\d+)?$/.test(str);
      });

      // If most cells are text-like, this is probably the header
      if (textCells.length >= nonEmptyCells.length * 0.6 && textCells.length >= 4) {
        // Verify this isn't a unit sub-header
        if (this.isUnitSubHeaderRow(row)) continue;
        return i;
      }
    }
    return this.findFirstNonEmptyRowIndex(rows);
  }

  async execute(data: ImportProductsFromCsvExcelDTO): Promise<ImportResult> {
    const { companyId, warehouseId, sourceFileId, fileBuffer, fileName, preview = false } = data;

    if (!companyId) {
      throw AppError.badRequest('companyId is required', 'MISSING_COMPANY_ID');
    }

    if (preview && warehouseId) {
      await this.ensureWarehouseMatchesCompany(companyId, warehouseId);
    }

    const resolvedWarehouseId = preview
      ? null
      : await this.resolveWarehouseId(companyId, warehouseId);

    const rows = await this.parseFile(fileBuffer, fileName);

    const result: ImportResult = {
      productsCreated: 0,
      productsUpdated: 0,
      stocksCreated: 0,
      errors: [],
      productIds: [],
      previewProducts: preview ? [] : undefined,
    };

    if (!preview && !resolvedWarehouseId) {
      throw AppError.internal('Warehouse resolution failed', 'WAREHOUSE_RESOLUTION_FAILED');
    }
    const warehouseIdToUse = resolvedWarehouseId ?? '';
    const registrationLookup = new ProductRegistrationLookupService();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 1;

      try {
        if (!row.productName || !row.productName.trim()) {
          continue; // Skip empty/separator rows silently
        }

        // Skip repeated header rows, page markers, and section titles embedded in data
        const nameUpper = row.productName.trim().toUpperCase();
        if (
          nameUpper.includes('NOME PRODOTTO') ||
          nameUpper.includes('FITOSANITARIO') ||
          nameUpper.includes('FORMULATO COMMERCIALE') ||
          nameUpper.includes('SCHEDA MAGAZZIN') ||
          /^PAG\s+\d+$/i.test(nameUpper)
        ) {
          continue;
        }

        if (typeof row.quantity !== 'number' || Number.isNaN(row.quantity) || row.quantity < 0) {
          result.errors.push(`Row ${rowNumber}: quantity must be a valid non-negative number`);
          continue;
        }

        if (!row.unitOfMeasureQuantity || !row.unitOfMeasureQuantity.trim()) {
          result.errors.push(`Row ${rowNumber}: unitOfMeasureQuantity is required`);
          continue;
        }

        // Detect initial stock rows: DDT date is just a year (e.g., "2024") or no date/code at all but has quantity
        const ddtDateRaw = row.ddtDate?.trim() ?? '';
        const isYearOnlyStock = /^\d{4}$/.test(ddtDateRaw) && parseInt(ddtDateRaw) < 2100;

        const hasDdtCode = row.ddtCode && row.ddtCode.trim();
        const hasInvoiceCode = row.invoiceCode && row.invoiceCode.trim();
        const hasDdtDate = row.ddtDate && row.ddtDate.trim();
        const hasInvoiceDate = row.invoiceDate && row.invoiceDate.trim();

        // Initial stock: year-only date OR no document references at all (only GIACENZA INIZIALE)
        const isInitialStock =
          isYearOnlyStock || (!hasDdtCode && !hasInvoiceCode && !hasDdtDate && !hasInvoiceDate);

        if (!hasDdtCode && !hasInvoiceCode && !isInitialStock) {
          result.errors.push(`Row ${rowNumber}: ddtCode or invoiceCode is required`);
          continue;
        }

        if (!hasDdtDate && !hasInvoiceDate && !isInitialStock) {
          result.errors.push(`Row ${rowNumber}: ddtDate or invoiceDate is required`);
          continue;
        }

        const productName = row.productName.trim();
        const invoiceDateParsed = parseDate(row.invoiceDate);
        let ddtDateParsed = parseDate(row.ddtDate) ?? invoiceDateParsed;
        // For initial stock rows, use Jan 1 of the given year (or current year) as a fallback date
        if (!ddtDateParsed && isInitialStock) {
          const year = isYearOnlyStock ? parseInt(ddtDateRaw) : new Date().getFullYear();
          ddtDateParsed = new Date(year, 0, 1);
        }
        if (!ddtDateParsed) {
          result.errors.push(
            `Row ${rowNumber}: date "${row.ddtDate || row.invoiceDate}" could not be parsed`,
          );
          continue;
        }
        const invoiceDueDateParsed = parseDate(row.invoiceDueDate);
        const movementType = row.type ?? 'IN';
        const signedQuantity = movementType === 'OUT' ? -Math.abs(row.quantity) : row.quantity;
        const stockPrice = row.price ?? 0;
        const stockPriceUnit = row.unitOfMeasurePrice?.trim() || 'EUR';

        let rowRegistrationNumber = row.registrationNumber?.trim() ?? null;
        let rowCategory = mapToProductCategory(row.category, rowRegistrationNumber);

        // If no registration number and no explicit pesticide category,
        // try to look up the product name in the fitosanitari registry
        if (!rowRegistrationNumber && rowCategory !== ProductCategory.PESTICIDE) {
          const lookupResult = registrationLookup.findProduct(productName);
          if (lookupResult) {
            rowRegistrationNumber = lookupResult.registrationNumber;
            rowCategory = ProductCategory.PESTICIDE;
          }
        }

        const fitosanitariService = FitosanitariLookupService.getInstance();
        const rowAdministrativeStatus =
          rowCategory === ProductCategory.PESTICIDE
            ? fitosanitariService.lookupStatus(rowRegistrationNumber, productName)
            : null;

        if (preview) {
          result.previewProducts?.push({
            name: productName,
            sku: row.sku?.trim() || undefined,
            barcode: null,
            category: rowCategory,
            type: 'Generico',
            description: null,
            registrationNumber: rowRegistrationNumber,
            stock: {
              quantity: signedQuantity,
              unitOfMeasureQuantity: row.unitOfMeasureQuantity.trim(),
              price: stockPrice,
              unitOfMeasurePrice: stockPriceUnit,
              type: movementType,
              ddtCode:
                row.ddtCode?.trim() ||
                row.invoiceCode?.trim() ||
                (isInitialStock ? `GIACENZA ${ddtDateRaw || new Date().getFullYear()}` : ''),
              ddtDate: ddtDateParsed.toISOString(),
              invoiceCode: row.invoiceCode?.trim() || null,
              invoiceDate: invoiceDateParsed?.toISOString() ?? null,
              invoiceDueDate: invoiceDueDateParsed?.toISOString() ?? null,
              companySupplierName: row.supplierName?.trim() || null,
              addressSupplier: null,
              vatNumberSupplier: null,
            },
          });
          continue;
        }

        const existingProduct = await this.productRepository.findByNameAndWarehouseId(
          productName,
          warehouseIdToUse,
        );

        let productId: string;

        if (existingProduct) {
          productId = existingProduct.id;
          result.productsUpdated++;
        } else {
          const newProduct = Product.create({
            warehouseId: warehouseIdToUse,
            name: productName,
            sku: row.sku?.trim() ?? '',
            barcode: null,
            category: rowCategory,
            type: 'Generico',
            description: null,
            administrativeStatus: rowAdministrativeStatus,
            registrationNumber: rowRegistrationNumber,
            labelUrl: null,
            labelMetadata: null,
          });
          const createdProduct = await this.productRepository.create(newProduct);
          productId = createdProduct.id;
          result.productsCreated++;
        }

        if (!result.productIds.includes(productId)) {
          result.productIds.push(productId);
        }

        const canonicalConversion = convertQuantityToCanonicalUnit(
          row.quantity,
          row.unitOfMeasureQuantity.trim(),
        );

        const stock = Stock.create({
          productId,
          sourceFileId: sourceFileId ?? null,
          jobId: null,
          quantity: signedQuantity,
          unitOfMeasureQuantity: row.unitOfMeasureQuantity.trim(),
          price: stockPrice,
          unitOfMeasurePrice: stockPriceUnit,
          type: movementType,
          ddtCode: normalizeDdtCode(
            row.ddtCode ||
              row.invoiceCode ||
              (isInitialStock ? `GIACENZA ${ddtDateRaw || new Date().getFullYear()}` : ''),
          ),
          ddtDate: ddtDateParsed,
          ddtUrlFile: null,
          invoiceCode: row.invoiceCode?.trim() || null,
          invoiceDate: invoiceDateParsed,
          invoiceDueDate: invoiceDueDateParsed,
          invoiceUrlFile: null,
          companySupplierName: row.supplierName?.trim() || null,
          addressSupplier: null,
          vatNumberSupplier: null,
          productNameAsOnDocument: row.productName.trim(),
          quantityConverted: canonicalConversion?.quantityConverted ?? null,
          unitMeasureConverted: canonicalConversion?.unitMeasureConverted ?? null,
        });

        await this.stockRepository.create(stock);
        result.stocksCreated++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Row ${rowNumber}: ${message}`);
      }
    }

    return result;
  }

  private async ensureWarehouseMatchesCompany(
    companyId: string,
    warehouseId: string,
  ): Promise<void> {
    const warehouse = await this.warehouseRepository.findById(warehouseId);
    if (!warehouse) {
      throw AppError.notFound('Warehouse not found', 'WAREHOUSE_NOT_FOUND');
    }
    if (warehouse.companyId !== companyId) {
      throw AppError.badRequest(
        'Warehouse does not belong to the specified company',
        'WAREHOUSE_COMPANY_MISMATCH',
      );
    }
  }

  private async resolveWarehouseId(companyId: string, warehouseId?: string): Promise<string> {
    if (warehouseId) {
      await this.ensureWarehouseMatchesCompany(companyId, warehouseId);
      return warehouseId;
    }

    const warehouses = await this.warehouseRepository.findManyByCompanyId(companyId);
    if (warehouses.length > 0) {
      return warehouses[0].id;
    }

    const defaultWarehouse = Warehouse.create({
      companyId,
      name: 'Magazzino Principale',
      address: 'N/A',
      nation: null,
      region: null,
      city: null,
      cap: null,
      sezione: 'N/A',
      foglio: 'N/A',
      particella: 'N/A',
      subalterno: null,
    });

    const createdWarehouse = await this.warehouseRepository.create(defaultWarehouse);
    return createdWarehouse.id;
  }

  private async parseFile(fileBuffer: Buffer, fileName: string): Promise<CsvExcelRow[]> {
    const lowerFileName = fileName.toLowerCase();

    if (lowerFileName.endsWith('.csv')) {
      return this.parseCsv(fileBuffer);
    }

    if (lowerFileName.endsWith('.xls') || lowerFileName.endsWith('.xlsx')) {
      return this.parseExcel(fileBuffer);
    }

    throw AppError.badRequest(
      'Unsupported file type. Please upload CSV or Excel file.',
      'UNSUPPORTED_FILE_TYPE',
    );
  }

  /**
   * Detects the best delimiter for CSV parsing.
   * Prefers semicolon or tab if they produce consistent column counts.
   * Falls back to comma if no better option is found.
   */
  private detectDelimiter(content: string): string {
    const lines = content.split('\n').filter((line) => line.trim());
    if (lines.length === 0) return ';';

    const firstLine = lines[0];

    // Try different delimiters and count columns
    const delimiters = [';', '\t', ','];
    const columnCounts: Record<string, number[]> = {};

    for (const delimiter of delimiters) {
      columnCounts[delimiter] = [];
      for (const line of lines.slice(0, Math.min(5, lines.length))) {
        // Simple split (not accounting for quotes, but good for detection)
        const count = line.split(delimiter).length;
        columnCounts[delimiter].push(count);
      }
    }

    // Prefer semicolon if it produces consistent column count > 1
    const semicolonCounts = columnCounts[';'];
    if (semicolonCounts.length > 0 && semicolonCounts[0] > 1) {
      const allSame = semicolonCounts.every((c) => c === semicolonCounts[0]);
      if (allSame) return ';';
    }

    // Then try tab
    const tabCounts = columnCounts['\t'];
    if (tabCounts.length > 0 && tabCounts[0] > 1) {
      const allSame = tabCounts.every((c) => c === tabCounts[0]);
      if (allSame) return '\t';
    }

    // Check if comma produces reasonable column count
    // If semicolon is present in first line, prefer semicolon
    if (firstLine.includes(';')) {
      return ';';
    }

    return ',';
  }

  /**
   * Checks if a value looks like a unit of measure.
   */
  private isValidUnitOfMeasure(value: string): boolean {
    if (!value) return false;
    const trimmed = value.trim().toLowerCase();
    const validUnits = [
      'kg',
      'lt',
      'l',
      'g',
      'ml',
      'pz',
      'n°',
      'n',
      'pezzi',
      'unità',
      'conf',
      'confezione',
      'confezioni',
      'sacchi',
      'sacco',
      'flacone',
      'flaconi',
      'bottiglia',
      'bottiglie',
      'tanica',
      'taniche',
    ];
    return validUnits.some((u) => trimmed === u || trimmed.startsWith(u));
  }

  /**
   * Checks if a value looks like a numeric string (including decimal parts).
   */
  private looksLikeNumber(value: string): boolean {
    if (!value) return false;
    const trimmed = value.trim();
    // Check if it's all digits (possibly a decimal part that was split)
    return /^\d+$/.test(trimmed);
  }

  private normalizeMovementType(value: string): 'IN' | 'OUT' {
    const normalized = String(value ?? '')
      .trim()
      .toUpperCase();
    if (normalized === 'OUT' || normalized === 'USCITA' || normalized === 'SCARICO') {
      return 'OUT';
    }
    return 'IN';
  }

  private async parseCsv(fileBuffer: Buffer): Promise<CsvExcelRow[]> {
    const content = fileBuffer.toString('utf-8');

    // Detect delimiter intelligently
    const detectedDelimiter = this.detectDelimiter(content);

    // Parse as raw rows first to handle extra columns from split decimal numbers
    const rawRows = parse(content, {
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      delimiter: detectedDelimiter,
      quote: '"',
      bom: true,
      ltrim: true,
      rtrim: true,
    }) as string[][];

    if (rawRows.length === 0) {
      return [];
    }

    // First row is the header
    const headerRow = rawRows[0].map((col) => String(col ?? '').trim());
    const dataRows = rawRows
      .slice(1)
      .filter((row) => row.some((cell) => String(cell ?? '').trim()));

    const mapping = await this.resolveColumnIndexMapping(headerRow, dataRows);

    return dataRows.map((row) => {
      // Get values by column index, with fallback to empty string
      const getValue = (idx: number): string => (idx >= 0 && idx < row.length ? row[idx] : '');

      const productName = getValue(mapping.productNameIdx);
      const sku = getValue(mapping.skuIdx);
      const registrationNumber = getValue(mapping.registrationNumberIdx) || undefined;
      const category = getValue(mapping.categoryIdx) || undefined;
      const supplierName = getValue(mapping.supplierNameIdx) || undefined;
      let quantityStr = getValue(mapping.quantityIdx) || '0';
      let unitOfMeasureQuantity = getValue(mapping.unitOfMeasureQuantityIdx);
      const price = this.normalizeNumber(getValue(mapping.priceIdx) || '0');
      const unitOfMeasurePrice = getValue(mapping.unitOfMeasurePriceIdx);
      const type = this.normalizeMovementType(getValue(mapping.typeIdx));
      let ddtCode = getValue(mapping.ddtCodeIdx);
      let ddtDate = getValue(mapping.ddtDateIdx);
      const invoiceCode = getValue(mapping.invoiceCodeIdx) || undefined;
      const invoiceDate = getValue(mapping.invoiceDateIdx);
      const invoiceDueDate = getValue(mapping.invoiceDueDateIdx);

      // IMPORTANT: Detect and fix shifted columns due to comma in numeric values
      // When comma is delimiter and a decimal number like "85,8338" is split:
      // - quantityStr = "85"
      // - unitOfMeasureQuantity = "8338" (looks like a number)
      // - ddtCode = "kg" (the actual unit)
      // - ddtDate = "ddt1" (the actual DDT code)
      // - extra column at the end = "11/10/24" (the actual date)
      const unitLooksLikeNumber = this.looksLikeNumber(unitOfMeasureQuantity);
      const ddtLooksLikeUnit = this.isValidUnitOfMeasure(ddtCode);

      if (
        detectedDelimiter === ',' &&
        unitLooksLikeNumber &&
        this.looksLikeNumber(quantityStr) &&
        ddtLooksLikeUnit
      ) {
        // Reconstruct the decimal number
        quantityStr = `${quantityStr},${unitOfMeasureQuantity}`;

        // Shift fields back to correct positions
        unitOfMeasureQuantity = ddtCode;
        ddtCode = ddtDate;

        // The actual DDT date should be in the extra column (after the original header columns)
        // Since we parsed raw rows, we can access it directly
        const extraColumnIdx = headerRow.length;
        if (extraColumnIdx < row.length) {
          ddtDate = row[extraColumnIdx];
        } else {
          // Fallback: look for a date-like value in remaining columns
          const datePattern = /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/;
          for (let i = headerRow.length; i < row.length; i++) {
            if (datePattern.test(row[i].trim())) {
              ddtDate = row[i];
              break;
            }
          }
        }
      } else if (detectedDelimiter === ',') {
        // Handle other potential split cases where the shift condition isn't fully met
        // but we still might have a split number
        if (
          mapping.quantityIdx >= 0 &&
          mapping.quantityIdx < row.length - 1 &&
          this.looksLikeNumber(quantityStr) &&
          this.looksLikeNumber(row[mapping.quantityIdx + 1])
        ) {
          // Check if the value after the split looks like it should be the unit
          const potentialDecimal = row[mapping.quantityIdx + 1];
          const afterDecimalIdx = mapping.quantityIdx + 2;
          if (afterDecimalIdx < row.length && this.isValidUnitOfMeasure(row[afterDecimalIdx])) {
            // Reconstruct number
            quantityStr = `${quantityStr},${potentialDecimal}`;
          }
        }
      }

      const quantity = this.normalizeNumber(quantityStr);

      return {
        productName,
        sku: sku || undefined,
        registrationNumber,
        category,
        supplierName,
        quantity,
        unitOfMeasureQuantity,
        price,
        unitOfMeasurePrice: unitOfMeasurePrice || undefined,
        type,
        ddtCode,
        ddtDate,
        invoiceCode,
        invoiceDate: invoiceDate || undefined,
        invoiceDueDate: invoiceDueDate || undefined,
      };
    });
  }

  /**
   * Selects the best data sheet from an Excel workbook, skipping cover pages and historical sheets.
   */
  private selectBestSheet(workbook: XLSX.WorkBook): string {
    const DATA_KEYWORDS = ['magazzino', 'scheda', 'dati', 'prodott', 'societa'];
    const SKIP_KEYWORDS = ['frontespizio', 'ordini', 'copertina', 'storico', 'foglio'];

    const candidates = workbook.SheetNames.filter(
      (name) => !SKIP_KEYWORDS.some((kw) => name.toLowerCase().includes(kw)),
    );

    const keywordMatch = candidates.find((name) =>
      DATA_KEYWORDS.some((kw) => name.toLowerCase().includes(kw)),
    );
    if (keywordMatch) return keywordMatch;

    // Fallback: sheet with most rows among candidates (or all sheets)
    const pool = candidates.length > 0 ? candidates : workbook.SheetNames;
    let bestSheet = pool[0];
    let bestRowCount = 0;
    for (const name of pool) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }).length;
      if (rows > bestRowCount) {
        bestRowCount = rows;
        bestSheet = name;
      }
    }
    return bestSheet;
  }

  private async parseExcel(fileBuffer: Buffer): Promise<CsvExcelRow[]> {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    if (workbook.SheetNames.length === 0) {
      throw AppError.badRequest('Excel file is empty', 'EMPTY_EXCEL_FILE');
    }

    const sheetName = this.selectBestSheet(workbook);
    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      defval: '',
      header: 1,
    }) as string[][];

    if (rawRows.length === 0) {
      return [];
    }

    // Use smart header detection instead of first non-empty row
    const headerRowIndex = this.findHeaderRowIndex(rawRows);
    if (headerRowIndex < 0) {
      return [];
    }

    const headerRow = rawRows[headerRowIndex].map((col) => String(col ?? '').trim());

    // Detect and skip unit sub-header row (e.g., "Kg o Lt", "Ha", "EUR/kg-Lt")
    let dataStartIndex = headerRowIndex + 1;
    let defaultUnitOfMeasure = '';
    if (dataStartIndex < rawRows.length && this.isUnitSubHeaderRow(rawRows[dataStartIndex])) {
      const unitRow = rawRows[dataStartIndex];
      // Extract unit for quantity-like columns as default
      const quantityKeywords = ['quantit', 'giacenz', 'qty'];
      for (let ci = 0; ci < headerRow.length; ci++) {
        const hdr = this.normalizeHeaderKey(headerRow[ci]);
        if (quantityKeywords.some((kw) => hdr.includes(kw))) {
          const unitVal = String(unitRow[ci] ?? '')
            .trim()
            .replace(/[()]/g, '');
          if (unitVal) {
            defaultUnitOfMeasure = unitVal;
            break;
          }
        }
      }
      dataStartIndex++;
    }

    const dataRows = rawRows
      .slice(dataStartIndex)
      .filter((row) => row.some((cell) => String(cell ?? '').trim()));

    const mapping = await this.resolveColumnIndexMapping(headerRow, dataRows);

    return dataRows.map((row) => {
      const getValue = (idx: number): string =>
        idx >= 0 && idx < row.length ? String(row[idx] ?? '') : '';

      const productName = getValue(mapping.productNameIdx);
      const sku = getValue(mapping.skuIdx);
      const registrationNumber = getValue(mapping.registrationNumberIdx) || undefined;
      const category = getValue(mapping.categoryIdx) || undefined;
      const supplierName = getValue(mapping.supplierNameIdx) || undefined;
      let quantityStr = getValue(mapping.quantityIdx);
      // For initial stock rows (no purchase quantity), fall back to GIACENZA INIZIALE
      if (!quantityStr && mapping.initialStockQuantityIdx >= 0) {
        quantityStr = getValue(mapping.initialStockQuantityIdx);
      }
      quantityStr = quantityStr || '0';
      let unitOfMeasureQuantity = getValue(mapping.unitOfMeasureQuantityIdx);
      if (!unitOfMeasureQuantity && defaultUnitOfMeasure) {
        unitOfMeasureQuantity = defaultUnitOfMeasure;
      }
      const priceStr = getValue(mapping.priceIdx) || '0';
      const unitOfMeasurePrice = getValue(mapping.unitOfMeasurePriceIdx);
      const type = this.normalizeMovementType(getValue(mapping.typeIdx));
      const ddtCode = getValue(mapping.ddtCodeIdx);
      const ddtDate = getValue(mapping.ddtDateIdx);
      const invoiceCode = getValue(mapping.invoiceCodeIdx) || undefined;
      const invoiceDate = getValue(mapping.invoiceDateIdx);
      const invoiceDueDate = getValue(mapping.invoiceDueDateIdx);
      const quantity = this.normalizeNumber(String(quantityStr));
      const price = this.normalizeNumber(String(priceStr));

      return {
        productName,
        sku: sku || undefined,
        registrationNumber,
        category,
        supplierName,
        quantity,
        unitOfMeasureQuantity: unitOfMeasureQuantity || 'KG',
        price,
        unitOfMeasurePrice: unitOfMeasurePrice || undefined,
        type,
        ddtCode,
        ddtDate,
        invoiceCode,
        invoiceDate: invoiceDate || undefined,
        invoiceDueDate: invoiceDueDate || undefined,
      };
    });
  }
}
