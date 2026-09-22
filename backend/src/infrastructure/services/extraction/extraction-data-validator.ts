import { z, type ZodError } from 'zod';
import { AppError } from '../../../domain/errors/AppError';
import {
  type DdtExtractionData,
  type ExtractionData,
  type InvoiceExtractionData,
} from '../../../domain/dtos/file-extraction.dto';
import { type ConfirmableStockEntry } from '../../../domain/dtos/extraction-confirm-request.dto';
import { type InvoiceEntry } from '../../../domain/dtos/invoice-entry.dto';

const sourceChannelSchema = z.enum(['llm-primary', 'deterministic-fallback', 'xml']);
const productCategorySchema = z.string().min(1);

const invoiceEntrySchema = z
  .object({
    productName: z.string(),
    registrationNumber: z.string().nullable(),
    productCategory: productCategorySchema,
    administrativeStatus: z
      .string()
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    quantity: z.number().nullable(),
    quantityUnitOfMeasure: z.string().nullable(),
    quantityConverted: z.number().nullable().optional(),
    unitMeasureConverted: z.string().nullable().optional(),
    accepted: z.boolean().optional(),
    supplierName: z.string().nullable(),
    supplierVat: z.string().nullable(),
    invoiceNumber: z.string().nullable(),
    invoiceDate: z.string().nullable(),
    invoiceDueDate: z.string().nullable(),
    unitPrice: z.number().nullable(),
    totalPrice: z.number().nullable(),
    needsReview: z.boolean().optional(),
    reviewReasons: z.array(z.string()).readonly().optional(),
    sourceRowIndex: z.number().int().nonnegative().optional(),
    productCode: z.string().nullable().optional(),
    rawLine: z.string().optional(),
    sourceChannel: sourceChannelSchema.optional(),
  })
  .passthrough();

const ddtEntrySchema = invoiceEntrySchema
  .omit({
    administrativeStatus: true,
    invoiceNumber: true,
    invoiceDate: true,
    invoiceDueDate: true,
  })
  .extend({
    ddtDate: z.string().nullable(),
    orderNumber: z.string().nullable(),
    unitPrice: z.number().nullable().optional(),
    totalPrice: z.number().nullable().optional(),
  })
  .passthrough();

const invoiceExtractionSchema = z.object({
  entries: z.array(invoiceEntrySchema).readonly(),
  extractedCount: z.number().int().nonnegative(),
});

const ddtExtractionSchema = z.object({
  entries: z.array(ddtEntrySchema).readonly(),
  extractedCount: z.number().int().nonnegative(),
});

/**
 * Runtime validator for editable extraction JSON payloads.
 */
export class ExtractionDataValidator {
  static parseForCategory(category: string, value: unknown): ExtractionData {
    try {
      if (category === 'invoice')
        return invoiceExtractionSchema.parse(value) as InvoiceExtractionData;
      if (category === 'ddt') return ddtExtractionSchema.parse(value) as DdtExtractionData;
      return value as ExtractionData;
    } catch (error) {
      throw toBadRequest(error, 'INVALID_EXTRACTED_DATA');
    }
  }

  static parseConfirmInvoiceEntries(value: unknown): readonly InvoiceEntry[] {
    return ExtractionDataValidator.parseConfirmEntries('invoice', value) as readonly InvoiceEntry[];
  }

  static parseConfirmEntries(category: string, value: unknown): readonly ConfirmableStockEntry[] {
    try {
      const schema = category === 'ddt' ? ddtEntrySchema : invoiceEntrySchema;
      return z.array(schema).readonly().parse(value) as readonly ConfirmableStockEntry[];
    } catch (error) {
      throw toBadRequest(error, 'INVALID_CONFIRM_PAYLOAD');
    }
  }
}

function toBadRequest(error: unknown, code: string): Error {
  const message =
    error instanceof z.ZodError ? formatZodError(error) : 'Invalid extraction payload';
  return AppError.badRequest(message, code);
}

function formatZodError(error: ZodError): string {
  const first = error.issues[0];
  if (!first) return 'Invalid extraction payload';
  const path = first.path.length > 0 ? first.path.join('.') : 'payload';
  return `Invalid extraction payload at ${path}: ${first.message}`;
}
