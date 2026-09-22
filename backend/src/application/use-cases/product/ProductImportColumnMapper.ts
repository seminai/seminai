import { z } from 'zod';
import { createChatModel } from '../../../infrastructure/services/llm-model-factory';
import { hasChatLlmApiKey } from '../../../infrastructure/services/llm-config';
import { getDefaultColumnIndexMapping } from './product-import-default-columns';
import type { ColumnIndexMapping } from './product-import.types';
import { buildHeaderIndexMap, normalizeHeaderKey } from './product-import-row-utils';

const nullableHeader = (description: string) => z.string().nullable().describe(description);
const ColumnMappingSchema = z.object({
  productName: nullableHeader('Header for the product name'),
  sku: nullableHeader('Header for the optional SKU'),
  registrationNumber: nullableHeader('Header for the product registration number'),
  category: nullableHeader('Header for the product category'),
  quantity: nullableHeader('Header for the stock quantity'),
  unitOfMeasureQuantity: nullableHeader('Header for the stock unit of measure'),
  price: nullableHeader('Header for the stock price'),
  unitOfMeasurePrice: nullableHeader('Header for the stock price unit'),
  type: nullableHeader('Header for the stock movement type'),
  supplierName: nullableHeader('Header for the supplier name'),
  ddtCode: nullableHeader('Header for the delivery note number'),
  ddtDate: nullableHeader('Header for the delivery note date'),
  invoiceCode: nullableHeader('Header for the invoice number'),
  invoiceDate: nullableHeader('Header for the invoice date'),
  invoiceDueDate: nullableHeader('Header for the invoice due date'),
});

type ColumnMapping = z.infer<typeof ColumnMappingSchema>;

const INDEX_FIELDS: ReadonlyArray<readonly [keyof ColumnMapping, keyof ColumnIndexMapping]> = [
  ['productName', 'productNameIdx'],
  ['sku', 'skuIdx'],
  ['registrationNumber', 'registrationNumberIdx'],
  ['category', 'categoryIdx'],
  ['supplierName', 'supplierNameIdx'],
  ['quantity', 'quantityIdx'],
  ['unitOfMeasureQuantity', 'unitOfMeasureQuantityIdx'],
  ['price', 'priceIdx'],
  ['unitOfMeasurePrice', 'unitOfMeasurePriceIdx'],
  ['type', 'typeIdx'],
  ['ddtCode', 'ddtCodeIdx'],
  ['ddtDate', 'ddtDateIdx'],
  ['invoiceCode', 'invoiceCodeIdx'],
  ['invoiceDate', 'invoiceDateIdx'],
  ['invoiceDueDate', 'invoiceDueDateIdx'],
];

export class ProductImportColumnMapper {
  async resolve(headerRow: string[], dataRows: string[][]): Promise<ColumnIndexMapping> {
    const headerIndexMap = buildHeaderIndexMap(headerRow);
    const defaults = getDefaultColumnIndexMapping(headerIndexMap);
    if (headerIndexMap.size === 0 || this.hasRequiredColumns(defaults)) return defaults;
    const sampleRows = dataRows
      .filter((row) => row.some((cell) => String(cell ?? '').trim()))
      .slice(0, 10)
      .map((row) => row.map((cell) => String(cell ?? '').trim()));
    try {
      const llmMapping = await this.classifyWithLlm(headerRow, sampleRows);
      const resolved: Record<keyof ColumnIndexMapping, number> = { ...defaults };
      for (const [mappingKey, indexKey] of INDEX_FIELDS) {
        const headerName = llmMapping[mappingKey];
        if (!headerName) continue;
        const llmIndex = headerIndexMap.get(normalizeHeaderKey(headerName));
        if (llmIndex !== undefined) resolved[indexKey] = llmIndex;
      }
      return resolved;
    } catch {
      return defaults;
    }
  }

  private hasRequiredColumns(mapping: ColumnIndexMapping): boolean {
    const hasProductAndQuantity =
      mapping.productNameIdx >= 0 &&
      (mapping.quantityIdx >= 0 || mapping.initialStockQuantityIdx >= 0);
    const hasDocument =
      mapping.ddtCodeIdx >= 0 || mapping.invoiceCodeIdx >= 0 || mapping.ddtDateIdx >= 0;
    const hasDate = mapping.ddtDateIdx >= 0 || mapping.invoiceDateIdx >= 0;
    return hasProductAndQuantity && hasDocument && hasDate;
  }

  private async classifyWithLlm(headers: string[], sampleRows: string[][]): Promise<ColumnMapping> {
    if (!hasChatLlmApiKey()) {
      throw new Error('An LLM provider is required to classify import columns');
    }
    const { model } = createChatModel({
      modelName: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 500,
    });
    const structuredModel = model.withStructuredOutput(ColumnMappingSchema);
    const systemPrompt = `Map CSV or Excel headers to product and warehouse movement fields.
Use exactly one supplied header for each field. Return null when a field does not exist.
Required semantics:
- productName: commercial product name
- quantity and unitOfMeasureQuantity: stock quantity and unit
- price and unitOfMeasurePrice: unit price and currency/unit
- type: IN or OUT warehouse movement
- supplierName: supplier legal or display name
- ddtCode and ddtDate: delivery note identifier and date
- invoiceCode, invoiceDate, invoiceDueDate: invoice metadata
- sku, registrationNumber, category: optional product metadata
Do not invent values and do not map invoice columns to delivery-note fields.`;
    return structuredModel.invoke([
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Available headers:\n${JSON.stringify(headers)}\n\nSample rows:\n${JSON.stringify(sampleRows)}`,
      },
    ]);
  }
}
