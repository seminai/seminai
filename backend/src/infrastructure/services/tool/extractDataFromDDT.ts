import { CompanyKind } from '@prisma/client';
import { createChatModel } from '../llm-model-factory';
import type { OcrProvider } from '../ocr/ocr-provider';
import { DdtEntry } from '../../../domain/dtos/ddt-entry.dto';
import { DdtProductClassifier } from './ddt-product-classifier';
import { DdtDeterministicFallbackParser } from './ddt-deterministic-fallback-parser';
import {
  buildLlmInputPayload,
  extractFromDocument,
  type DualSourceExtractionResult,
} from '../extraction/dual-source-extractor';
import { DdtExtractionSchema, type DdtRow } from '../extraction/extraction-schema';
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

const LOG_PREFIX = '[DDT_EXTRACTION]';
const DEFAULT_MODEL_NAME = 'gpt-4o';
const DEFAULT_TEMPERATURE = 0;
/**
 * See extractDataFromInvoice.ts for the rationale: raise output budget to let
 * the LLM emit every row in multi-DDT PDFs (e.g. 3 separate DDTs in one file).
 */
const MAX_OUTPUT_TOKENS = 16_000;
const MIN_TEXT_LENGTH_FOR_EXTRACTION = 200;

const SYSTEM_PROMPT = `You are an expert operations analyst who reads Italian Delivery Notes (DDT).

CRITICAL COMPLETENESS RULE:
The PDF may contain MULTIPLE delivery notes concatenated (several pages, several "DDT" blocks with different "Data partenza" / "N.ORDINE" values). You MUST enumerate EVERY product row from EVERY DDT on EVERY page. Do not stop after the first DDT. When a new DDT begins, update ddtDate and orderNumber accordingly and keep extracting.

Return one row per product line found in the document. Repeat shared fields (ddtDate, orderNumber, supplierName, supplierVat) on every row of the same DDT.

Source priority:
- Prefer the STRUCTURED TABLE ROWS for quantity, quantityUnitOfMeasure, unitPrice, totalPrice.
- Always also scan the OCR FULL MARKDOWN section: tables after the first one are often missing from the structured rows because OCR corrupted their header ("ARTICOIO", "DESCRIPITÀ", etc.). Extract those rows from the markdown directly.
- Prefer the NATIVE PDF TEXT for productName spelling, registrationNumber, orderNumber and dates.
- If a source is absent, rely on the other one.

ADR / DANGEROUS GOODS DESCRIPTIONS:
Italian phytosanitary DDTs (e.g. Phyto Service) print an ADR/dangerous-goods classification line — starting with "UN" followed by 3–4 digits (e.g. "UN 3077 MATERIA PERICOLOSA...", "UN3082 MATERIA PERICOLOSA...", "UN 3265 LIQUIDO ORGANICO...") — directly BELOW the commercial product name within the SAME description cell. This UN line is a continuation of the row ABOVE it; it is NOT a separate product, and it is NOT part of the next product's name.
Rules:
- NEVER emit a row whose productName is or starts with "UN <digits> MATERIA PERICOLOSA...", "UN <digits> LIQUIDO ORGANICO..." or any similar ADR/dangerous-goods boilerplate.
- When you encounter a UN line, ignore it entirely — do not store it, and never prepend it to the productName of the row that follows.
- Each real product row is identified by its own merce/registration code and quantity in the structured table; use those columns to align the productName from the description cell.

${PRODUCT_NAME_PROMPT_INSTRUCTIONS}

Extraction rules:
- quantity and unitPrice are numbers. Convert Italian decimal commas to dots. Use null when truly missing.
- quantityUnitOfMeasure should use the canonical form when possible: KG, G, T, Q, L, LT, ML, NR, PZ, CF, SC, CT, CN. Ignore obviously wrong units ("CL" for a 50 KG bag of seeds) and fall back to what the row description implies.
- registrationNumber is the phytosanitary ministerial registration/authorization code ("Reg. n.", "Reg nr", "presidio") when present, otherwise null.
- ddtDate is the delivery note date ("Data di partenza", "Data DDT", "Data documento"), ISO format (YYYY-MM-DD).
- orderNumber is the order/document number ("Numero d'ordine", "N. ordine", "Num. ordine").
- When a table has columns "Articolo | Descrizione | UM | Quantità", take productName from "Descrizione", quantity from "Quantità", quantityUnitOfMeasure from "UM".
- Enumerate every row, including repeated products with different batches. Skip pure noise lines ("QTA VIRTUALE", "MERCE IN ESENZIONE", header/footer boilerplate).
- Never invent values. If you cannot determine a field, return null.`;

type ExtractedDdtEntry = Omit<DdtEntry, 'productCategory'>;

export interface DdtExtractionChain {
  invoke: (input: { content: string }) => Promise<{ rows: readonly DdtRow[] }>;
}

interface Dependencies {
  readonly chain?: DdtExtractionChain;
  readonly modelName?: string;
  readonly classifier?: DdtProductClassifier;
  readonly deterministicFallbackParser?: DdtDeterministicFallbackParser;
}

/**
 * Service responsible for extracting structured product data from DDT documents
 * (PDF or image) via OCR + structured-output LLM.
 */
export class ExtractDataFromDdtService {
  private readonly chain: DdtExtractionChain;
  private readonly classifier: DdtProductClassifier;
  private readonly deterministicFallbackParser: DdtDeterministicFallbackParser;

  constructor(dependencies?: Dependencies) {
    this.classifier = dependencies?.classifier ?? new DdtProductClassifier();
    this.deterministicFallbackParser =
      dependencies?.deterministicFallbackParser ?? new DdtDeterministicFallbackParser();
    this.chain = dependencies?.chain ?? buildDefaultDdtChain(dependencies?.modelName);
  }

  public async execute(params: {
    pdfPath: string;
    ocrProvider?: OcrProvider;
    companyKind?: CompanyKind;
  }): Promise<{
    entries: ReadonlyArray<DdtEntry>;
    rawTextPath: string;
  }> {
    const { pdfPath, ocrProvider, companyKind } = params;
    const startedAt = Date.now();
    console.log(`${LOG_PREFIX} Starting extraction for: ${pdfPath}`);
    const extraction = await extractFromDocument({
      filePath: pdfPath,
      ocrProvider,
      logPrefix: LOG_PREFIX,
    });
    return this.runExtractionPipeline(extraction, pdfPath, startedAt, companyKind);
  }

  private async runExtractionPipeline(
    extraction: DualSourceExtractionResult,
    filePath: string,
    startedAt: number,
    companyKind?: CompanyKind,
  ): Promise<{ entries: ReadonlyArray<DdtEntry>; rawTextPath: string }> {
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
      documentKind: 'ddt',
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
  ): Promise<{ entries: ReadonlyArray<ExtractedDdtEntry>; channel: ExtractionChannel }> {
    try {
      const result = await this.chain.invoke({ content: payload });
      if (result.rows.length > 0) {
        const entries = result.rows.map(toDdtEntry).filter(hasMeaningfulProductName);
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

function buildDefaultDdtChain(modelName?: string): DdtExtractionChain {
  const { model: llm } = createChatModel({
    modelName: modelName ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL_NAME,
    temperature: DEFAULT_TEMPERATURE,
    maxTokens: MAX_OUTPUT_TOKENS,
    timeout: 180_000,
  });
  const structured = llm.withStructuredOutput(DdtExtractionSchema, { name: 'DdtRows' });
  return {
    invoke: async ({ content }) => {
      const result = await structured.invoke([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ]);
      return result as { rows: readonly DdtRow[] };
    },
  };
}

function toDdtEntry(row: DdtRow): ExtractedDdtEntry {
  const canonicalUnit = canonicalizeUnit(row.quantityUnitOfMeasure);
  return {
    productName: normalizeProductName(row.productName),
    registrationNumber: row.registrationNumber?.trim() || null,
    quantity: row.quantity,
    quantityUnitOfMeasure: canonicalUnit ?? row.quantityUnitOfMeasure,
    supplierName: row.supplierName?.trim() || null,
    supplierVat: row.supplierVat?.trim() || null,
    ddtDate: row.ddtDate?.trim() || null,
    orderNumber: row.orderNumber?.trim() || null,
    unitPrice: row.unitPrice,
    totalPrice: row.totalPrice,
  };
}

/**
 * Filter out rows that are pure metadata (e.g. the LLM emitted a row whose
 * productName is only a DDT reference or boilerplate after normalization).
 */
function hasMeaningfulProductName(entry: ExtractedDdtEntry): boolean {
  const name = entry.productName.trim();
  if (name.length < 2) return false;
  if (/^d\.?d\.?t\.?\s*n/i.test(name)) return false;
  return true;
}

function flagRow(entry: ExtractedDdtEntry): ExtractedDdtEntry {
  const verdict = validateRowCoherence({
    quantity: entry.quantity,
    quantityUnitOfMeasure: entry.quantityUnitOfMeasure,
    unitPrice: entry.unitPrice ?? null,
    totalPrice: entry.totalPrice ?? null,
  });
  return withReviewReasons(entry, verdict.reasons);
}

function countReview(entries: ReadonlyArray<{ needsReview?: boolean }>): number {
  return entries.filter((entry) => entry.needsReview).length;
}
