import { z } from 'zod';

export { CANONICAL_UNITS, type CanonicalUnit } from '../../../domain/dtos/canonical-units.dto';

/**
 * Schemas are intentionally fully inlined:
 *  - No shared sub-schemas (would trigger `$ref` generation).
 *  - No `.describe(...)` on object/array nodes (would trigger `$ref + title`).
 *  - `.describe(...)` stays on leaf scalars: OpenAI accepts descriptions on
 *    primitive nodes but rejects `$ref` with sibling keywords.
 *
 * This pattern is the safest way to get a Zod schema through OpenAI's strict
 * Structured Outputs validator.
 */

/**
 * Zod schema for a single invoice row produced by the LLM.
 */
export const InvoiceRowSchema = z.object({
  productName: z
    .string()
    .describe(
      'Commercial product name as printed in the row. Keep packaging/weight details (e.g. "SERCADIS SC 1 L"). Do not include the article/SKU code.',
    ),
  registrationNumber: z
    .string()
    .nullable()
    .describe('Ministerial phytosanitary registration/authorization code or null.'),
  quantity: z
    .number()
    .nullable()
    .describe('Ordered quantity (decimal commas converted to decimal points).'),
  quantityUnitOfMeasure: z
    .string()
    .nullable()
    .describe('Unit of measure uppercased when possible (KG, L, LT, ML, NR, PZ, CF, SC).'),
  supplierName: z.string().nullable().describe('Supplier entity issuing the document.'),
  supplierVat: z.string().nullable().describe('Supplier VAT number (digits only when possible).'),
  unitPrice: z.number().nullable().describe('Price per unit or null.'),
  totalPrice: z.number().nullable().describe('Total line price or null.'),
  invoiceNumber: z.string().nullable().describe('Document number shared by all rows.'),
  invoiceDate: z.string().nullable().describe('Document date in ISO format YYYY-MM-DD.'),
  invoiceDueDate: z.string().nullable().describe('Payment due date ISO YYYY-MM-DD or null.'),
});

export type InvoiceRow = z.infer<typeof InvoiceRowSchema>;

/**
 * Zod schema for a single DDT row produced by the LLM.
 */
export const DdtRowSchema = z.object({
  productName: z
    .string()
    .describe(
      'Commercial product name as printed in the row. Keep packaging/weight details (e.g. "SERCADIS SC 1 L"). Do not include the article/SKU code.',
    ),
  registrationNumber: z
    .string()
    .nullable()
    .describe('Ministerial phytosanitary registration/authorization code or null.'),
  quantity: z
    .number()
    .nullable()
    .describe('Ordered quantity (decimal commas converted to decimal points).'),
  quantityUnitOfMeasure: z
    .string()
    .nullable()
    .describe('Unit of measure uppercased when possible (KG, L, LT, ML, NR, PZ, CF, SC).'),
  supplierName: z.string().nullable().describe('Supplier entity responsible for the shipment.'),
  supplierVat: z.string().nullable().describe('Supplier VAT number (digits only when possible).'),
  unitPrice: z.number().nullable().describe('Price per unit or null.'),
  totalPrice: z.number().nullable().describe('Total line price or null.'),
  ddtDate: z.string().nullable().describe('DDT date ISO YYYY-MM-DD.'),
  orderNumber: z.string().nullable().describe('Order/document number shared by all rows.'),
});

export type DdtRow = z.infer<typeof DdtRowSchema>;

/**
 * Top-level wrapper schemas. OpenAI structured output works best with an
 * object at the root (rather than a raw array), so we wrap the rows.
 */
export const InvoiceExtractionSchema = z.object({
  rows: z.array(InvoiceRowSchema),
});

export const DdtExtractionSchema = z.object({
  rows: z.array(DdtRowSchema),
});

export type InvoiceExtractionPayload = z.infer<typeof InvoiceExtractionSchema>;
export type DdtExtractionPayload = z.infer<typeof DdtExtractionSchema>;
