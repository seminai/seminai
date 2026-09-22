import type { InvoiceEntry } from '../../../domain/dtos/invoice-entry.dto';
import type { InvoiceExtractionData } from '../../../domain/dtos/file-extraction.dto';
import { enrichInvoiceEntriesWithConversions } from '../../../infrastructure/services/extraction/enrich-invoice-entries-with-conversions';
import { InvoiceProductClassifier } from '../../../infrastructure/services/tool/invoice-product-classifier';
import {
  applyLlmFertilizerFallback,
  type FertilizerFallbackClassifier,
} from './llm-fallback-invoice-category';

const classifier = new InvoiceProductClassifier();

interface ReviewLine {
  readonly productName?: unknown;
  readonly registrationNumber?: unknown;
  readonly quantity?: unknown;
  readonly unitOfMeasure?: unknown;
  readonly unitPrice?: unknown;
}

interface InvoiceReviewLike {
  readonly invoiceNumber?: unknown;
  readonly ddtNumber?: unknown;
  readonly invoiceDate?: unknown;
  readonly ddtDate?: unknown;
  readonly supplierName?: unknown;
  readonly supplierVat?: unknown;
  readonly lines?: unknown;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function computeTotalPrice(quantity: number | null, unitPrice: number | null): number | null {
  if (quantity === null || unitPrice === null) return null;
  return Math.round(quantity * unitPrice * 100) / 100;
}

/**
 * Converts the review payload (FatturaExtractionPayload / DdtExtractionPayload — flat italian-keyed)
 * into the standard InvoiceExtractionData consumed by the archive detail renderer and by
 * ExtractionConfirmer.confirmInvoice. Pipeline:
 *   1. Replicate shared header fields onto each entry.
 *   2. Sync classification: InvoiceProductClassifier resolves PHYTOSANITARY via the
 *      official registration dataset and applies the keyword regex for FERTILIZER.
 *   3. LLM fallback: every line still marked OTHER (without a registrationNumber) is
 *      sent in a single batch to the LLM classifier so naming variations the regex
 *      misses can still be promoted to FERTILIZER. Cached per-product-name.
 *   4. Enrich with canonical quantity conversions.
 */
export async function mapInvoiceReviewToExtractionData(
  reviewData: Record<string, unknown>,
  options?: { readonly llmFallback?: FertilizerFallbackClassifier | null },
): Promise<InvoiceExtractionData> {
  const review = reviewData as InvoiceReviewLike;
  const supplierName = asString(review.supplierName);
  const supplierVat = asString(review.supplierVat);
  const invoiceNumber = asString(review.invoiceNumber) ?? asString(review.ddtNumber);
  const invoiceDate = asString(review.invoiceDate) ?? asString(review.ddtDate);

  const rawLines = Array.isArray(review.lines) ? (review.lines as ReviewLine[]) : [];
  const unclassifiedEntries: Array<Omit<InvoiceEntry, 'productCategory' | 'administrativeStatus'>> =
    rawLines.map((line) => {
      const quantity = asNumber(line.quantity);
      const unitPrice = asNumber(line.unitPrice);
      return {
        productName: asString(line.productName) ?? '',
        registrationNumber: asString(line.registrationNumber),
        quantity,
        quantityUnitOfMeasure: asString(line.unitOfMeasure),
        accepted: true,
        supplierName,
        supplierVat,
        invoiceNumber,
        invoiceDate,
        invoiceDueDate: null,
        unitPrice,
        totalPrice: computeTotalPrice(quantity, unitPrice),
      };
    });

  const classified = classifier.execute({ entries: unclassifiedEntries });
  const llmRefined =
    options?.llmFallback === null
      ? classified
      : await applyLlmFertilizerFallback(classified, options?.llmFallback);
  const enriched = enrichInvoiceEntriesWithConversions(llmRefined);
  return { entries: enriched, extractedCount: enriched.length };
}
