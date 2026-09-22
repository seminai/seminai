import { CompanyKind } from '@prisma/client';
import { createChatModel } from '../llm-model-factory';
import type { OcrProvider } from '../ocr/ocr-provider';
import { InvoiceEntry } from '../../../domain/dtos/invoice-entry.dto';
import { InvoiceProductClassifier } from './invoice-product-classifier';
import { FatturaPaParser } from './fattura-pa-parser';
import { InvoiceDeterministicFallbackParser } from './invoice-deterministic-fallback-parser';
import {
  buildLlmInputPayload,
  extractFromDocument,
  type DualSourceExtractionResult,
} from '../extraction/dual-source-extractor';
import { InvoiceExtractionSchema, type InvoiceRow } from '../extraction/extraction-schema';
import {
  PRODUCT_NAME_PROMPT_INSTRUCTIONS,
  normalizeProductName,
} from '../extraction/product-name-rules';
import { canonicalizeUnit, validateRowCoherence } from '../extraction/row-validator';
import {
  recordExtractionTelemetry,
  type ExtractionChannel,
} from '../extraction/extraction-telemetry';
import { OcrRowReviewService } from '../extraction/ocr-row-review-service';
import { withReviewReasons } from '../extraction/review-reasons';

const LOG_PREFIX = '[INVOICE_EXTRACTION]';
const DEFAULT_MODEL_NAME = 'gpt-4o';
const DEFAULT_TEMPERATURE = 0;
/**
 * gpt-4o supports up to 16k output tokens. A single invoice row ≈ 250-350
 * tokens of JSON once all metadata fields are repeated. 16k tokens lets us
 * emit ~50+ rows comfortably, covering multi-page PDFs where several invoices
 * or DDTs are concatenated in the same document.
 */
const MAX_OUTPUT_TOKENS = 16_000;
const MIN_TEXT_LENGTH_FOR_EXTRACTION = 200;

const SYSTEM_PROMPT = `You are an expert accountant who reads Italian invoices (Fatture).

CRITICAL COMPLETENESS RULE:
The PDF may contain MULTIPLE invoices concatenated (several pages, several "FATTURA" blocks, several invoice numbers). You MUST enumerate EVERY product row from EVERY invoice on EVERY page. Do not stop at the first document. Do not deduplicate rows that legitimately repeat across invoices.

Return one row per product line found in the document. Repeat shared fields (invoiceNumber, invoiceDate, invoiceDueDate, supplierName, supplierVat) on every row. When the PDF contains multiple invoices, update invoiceNumber / invoiceDate for each new document.

Source priority:
- Prefer the STRUCTURED TABLE ROWS for quantity, quantityUnitOfMeasure, unitPrice, totalPrice (these come from an OCR-validated markdown table). The "productCode" field on each structured row is the supplier's article SKU (e.g. "XSER03BS" for SERCADIS, "XFOR02" for FORCE ULTRA, "XCON04FPC" for CONC.ACTIVE). Its alphabetic prefix usually mirrors the productName brand — use it as an anchor to detect column-misalignment from OCR.
- Always also scan the OCR FULL MARKDOWN section: tables after the first one are often missing from the structured rows because OCR corrupted their header. Extract those rows from the markdown directly.
- Prefer the NATIVE PDF TEXT for productName spelling, registrationNumber, invoiceNumber and dates (low risk of OCR hallucination).
- If a source is absent, rely on the other one.

CRITICAL: SECTION-HEADER ROWS ARE NOT PRODUCTS
Italian suppliers (Roverso Paolo, Phyto Service, similar) frequently print "Rif DT n.XXX del DD/MM/YY" markers INSIDE the product table to group rows by their source delivery note. These are metadata, never products:
- If a row's descrizione is ONLY "Rif DT n.XXX del DD/MM/YY" (even when the OCR has filled its quantity/prezzo cells with values that look real), SKIP the entire row.
- If "Rif DT n.XXX del DD/MM/YY" appears as the FIRST or LAST line of a multi-line descrizione cell, strip it and keep only the actual product description.
- The same rule applies to "D.d.T. N. XXX Del: DD/MM/YY" prefixes (legacy DDT references).
- "COPIA STAMPATA DI FATTURA ELETTRONICA, NON VALIDA AI FINI FISCALI." is invoice-footer boilerplate — never a product.

CRITICAL: DETECT OCR ROW-SHIFT
On scanned invoices with "Rif DT" section dividers, OCR may shift the productName column DOWN by one row (the section header's descrizione cell gets the next product's name, the next row's descrizione gets the row-after-next's name, etc.). Cross-check using:
- productCode prefix vs productName brand (XSER + "SCHERMO" = mismatch — likely shift).
- quantity × unitPrice ≈ totalPrice (within 3%). If the math doesn't hold for a row, the prices in that row probably belong to a different product.
When you detect a shift, prefer the productName that matches the productCode brand, and pair it with the values whose math is internally consistent.

${PRODUCT_NAME_PROMPT_INSTRUCTIONS}

Extraction rules:
- quantity and unitPrice are numbers. Convert Italian decimal commas to dots. Use null only when the value is truly missing.
- quantityUnitOfMeasure should use the canonical form when possible: KG, G, T, Q, L, LT, ML, NR, PZ, CF, SC, CT, CN. If the document uses a different abbreviation, keep it but write it in uppercase.
- registrationNumber is the phytosanitary ministerial registration/authorization code ("Reg. n.", "Reg nr", "presidio") when present, otherwise null.
- invoiceDate / invoiceDueDate must be ISO (YYYY-MM-DD).
- Skip discount lines (SCONTO, ABBUONO) and non-product lines (Spese Incasso, Bollo, Spese di trasporto, TOTALE FATTURA, IMPONIBILE).
- Do NOT emit duplicate rows: if two adjacent rows have identical productName + identical values, keep only one.
- Never invent values. If you cannot determine a field, return null.`;

type ExtractedInvoiceEntry = Omit<InvoiceEntry, 'productCategory' | 'administrativeStatus'>;

export interface InvoiceExtractionChain {
  invoke: (input: { content: string }) => Promise<{ rows: readonly InvoiceRow[] }>;
}

interface Dependencies {
  readonly chain?: InvoiceExtractionChain;
  readonly modelName?: string;
  readonly classifier?: InvoiceProductClassifier;
  readonly fatturaPaParser?: FatturaPaParser;
  readonly deterministicFallbackParser?: InvoiceDeterministicFallbackParser;
}

/**
 * Service responsible for extracting structured product data from invoice documents.
 * Supports both PDF (via OCR + structured LLM call) and XML (FatturaPA direct parsing).
 */
export class ExtractDataFromInvoiceService {
  private readonly chain: InvoiceExtractionChain;
  private readonly classifier: InvoiceProductClassifier;
  private readonly fatturaPaParser: FatturaPaParser;
  private readonly deterministicFallbackParser: InvoiceDeterministicFallbackParser;

  constructor(dependencies?: Dependencies) {
    this.classifier = dependencies?.classifier ?? new InvoiceProductClassifier();
    this.fatturaPaParser = dependencies?.fatturaPaParser ?? new FatturaPaParser();
    this.deterministicFallbackParser =
      dependencies?.deterministicFallbackParser ?? new InvoiceDeterministicFallbackParser();
    this.chain = dependencies?.chain ?? buildDefaultInvoiceChain(dependencies?.modelName);
  }

  public async execute(params: {
    filePath: string;
    ocrProvider?: OcrProvider;
    companyKind?: CompanyKind;
  }): Promise<{
    entries: ReadonlyArray<InvoiceEntry>;
    rawTextPath: string;
  }> {
    const { filePath, ocrProvider, companyKind } = params;
    const startedAt = Date.now();
    console.log(`${LOG_PREFIX} Starting extraction for: ${filePath}`);
    if (isXmlFile(filePath)) {
      const result = await this.extractFromXml(filePath, companyKind);
      recordExtractionTelemetry({
        documentKind: 'invoice',
        filePath,
        channel: 'fattura-pa-xml',
        durationMs: Date.now() - startedAt,
        ocrProvider: 'none',
        nativeTextLength: 0,
        ocrTextLength: 0,
        tablesDetected: 0,
        tableRowsDetected: 0,
        entriesExtracted: result.entries.length,
        needsReviewCount: countReview(result.entries),
      });
      return {
        entries: result.entries.map((entry, index) => ({
          ...entry,
          sourceRowIndex: index,
          sourceChannel: 'xml' as const,
        })),
        rawTextPath: result.rawTextPath,
      };
    }
    const extraction = await extractFromDocument({
      filePath,
      ocrProvider,
      logPrefix: LOG_PREFIX,
    });
    return this.runExtractionPipeline(extraction, filePath, startedAt, companyKind);
  }

  private async extractFromXml(
    filePath: string,
    companyKind?: CompanyKind,
  ): Promise<{
    entries: ReadonlyArray<InvoiceEntry>;
    rawTextPath: string;
  }> {
    const startTime = Date.now();
    try {
      const result = await this.fatturaPaParser.parseFromFile(filePath);
      const enriched = this.classifier.execute({ entries: result.entries, companyKind });
      console.log(
        `${LOG_PREFIX} XML extraction completed in ${Date.now() - startTime}ms — ${enriched.length} entries`,
      );
      return { entries: enriched, rawTextPath: filePath };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to extract invoice data from XML file ${filePath}: ${reason}`);
    }
  }

  private async runExtractionPipeline(
    extraction: DualSourceExtractionResult,
    filePath: string,
    startedAt: number,
    companyKind?: CompanyKind,
  ): Promise<{ entries: ReadonlyArray<InvoiceEntry>; rawTextPath: string }> {
    const payload = buildLlmInputPayload(extraction);
    if (!payload || payload.length === 0) {
      throw new Error(
        `Failed to extract text from ${filePath}. The document might be corrupted or empty.`,
      );
    }
    if (payload.length < MIN_TEXT_LENGTH_FOR_EXTRACTION) {
      console.warn(
        `${LOG_PREFIX} Payload is very short (${payload.length} chars), extraction might miss rows.`,
      );
    }
    const { entries: rawEntries, channel } = await this.extractEntriesWithFallback(
      payload,
      extraction,
    );
    const reviewed = OcrRowReviewService.apply({
      entries: rawEntries,
      tables: extraction.tables,
      channel,
    });
    const validated = reviewed.map((entry) => flagRow(entry));
    const enriched = this.classifier.execute({ entries: validated, companyKind });
    const needsReviewCount = countReview(enriched);
    console.log(
      `${LOG_PREFIX} Extraction completed — ${enriched.length} entries (needsReview: ${needsReviewCount})`,
    );
    recordExtractionTelemetry({
      documentKind: 'invoice',
      filePath,
      channel,
      durationMs: Date.now() - startedAt,
      ocrProvider: extraction.ocrProvider,
      ocrModel: extraction.ocrModel,
      pagesProcessed: extraction.pagesProcessed,
      nativeTextLength: extraction.nativeText.length,
      ocrTextLength: extraction.ocrMarkdown.length,
      tablesDetected: extraction.tables.length,
      tableRowsDetected: extraction.tables.reduce((acc, t) => acc + t.rows.length, 0),
      entriesExtracted: enriched.length,
      needsReviewCount,
    });
    return { entries: enriched, rawTextPath: extraction.rawTextPath };
  }

  private async extractEntriesWithFallback(
    payload: string,
    extraction: DualSourceExtractionResult,
  ): Promise<{ entries: ReadonlyArray<ExtractedInvoiceEntry>; channel: ExtractionChannel }> {
    try {
      const result = await this.chain.invoke({ content: payload });
      if (result.rows.length > 0) {
        const entries = result.rows.map(toInvoiceEntry).filter(hasMeaningfulProductName);
        console.log(
          `${LOG_PREFIX} Extraction channel: llm-primary (${entries.length}/${result.rows.length} rows after noise filter)`,
        );
        if (entries.length > 0) {
          return { entries, channel: 'llm-primary' };
        }
      }
      console.warn(`${LOG_PREFIX} LLM returned empty array, falling back to deterministic parser.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`${LOG_PREFIX} LLM extraction failed: ${reason}. Falling back.`);
    }
    const fallbackSource = extraction.ocrMarkdown || extraction.nativeText;
    const fallbackEntries = this.deterministicFallbackParser.execute({ text: fallbackSource });
    if (fallbackEntries.length > 0) {
      console.log(
        `${LOG_PREFIX} Extraction channel: deterministic-fallback (${fallbackEntries.length} rows)`,
      );
      return { entries: fallbackEntries, channel: 'deterministic-fallback' };
    }
    throw new Error('No entries could be extracted with primary or deterministic fallback.');
  }
}

function buildDefaultInvoiceChain(modelName?: string): InvoiceExtractionChain {
  const { model: llm } = createChatModel({
    modelName: modelName ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL_NAME,
    temperature: DEFAULT_TEMPERATURE,
    maxTokens: MAX_OUTPUT_TOKENS,
    timeout: 180_000,
  });
  const structured = llm.withStructuredOutput(InvoiceExtractionSchema, { name: 'InvoiceRows' });
  return {
    invoke: async ({ content }) => {
      const result = await structured.invoke([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ]);
      return result as { rows: readonly InvoiceRow[] };
    },
  };
}

function toInvoiceEntry(row: InvoiceRow): ExtractedInvoiceEntry {
  const canonicalUnit = canonicalizeUnit(row.quantityUnitOfMeasure);
  return {
    productName: normalizeProductName(row.productName),
    registrationNumber: row.registrationNumber?.trim() || null,
    quantity: row.quantity,
    quantityUnitOfMeasure: canonicalUnit ?? row.quantityUnitOfMeasure,
    supplierName: row.supplierName?.trim() || null,
    supplierVat: row.supplierVat?.trim() || null,
    invoiceNumber: row.invoiceNumber?.trim() || null,
    invoiceDate: row.invoiceDate?.trim() || null,
    invoiceDueDate: row.invoiceDueDate?.trim() || null,
    unitPrice: row.unitPrice,
    totalPrice: row.totalPrice,
  };
}

/**
 * Filter out rows that are pure metadata (e.g. the LLM emitted a row whose
 * productName is only a DDT reference or "Rif DT" section header after
 * normalization, or pure invoice-footer boilerplate). These add noise without
 * carrying any real product information.
 */
function hasMeaningfulProductName(entry: ExtractedInvoiceEntry): boolean {
  const name = entry.productName.trim();
  if (name.length < 2) return false;
  if (/^d\.?d\.?t\.?\s*n/i.test(name)) return false;
  if (/^rif\.?\s*d\.?\s*t\.?\s*n/i.test(name)) return false;
  if (/^copia\s+stampata\b/i.test(name)) return false;
  return true;
}

function flagRow(entry: ExtractedInvoiceEntry): ExtractedInvoiceEntry {
  const verdict = validateRowCoherence({
    quantity: entry.quantity,
    quantityUnitOfMeasure: entry.quantityUnitOfMeasure,
    unitPrice: entry.unitPrice,
    totalPrice: entry.totalPrice,
  });
  return withReviewReasons(entry, verdict.reasons);
}

function countReview(entries: ReadonlyArray<{ needsReview?: boolean }>): number {
  return entries.filter((entry) => entry.needsReview).length;
}

function isXmlFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.xml');
}
