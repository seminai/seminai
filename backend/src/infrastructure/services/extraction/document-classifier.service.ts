import { createHash } from 'node:crypto';
import { DocumentCategory } from '@prisma/client';
import { createChatModel } from '../llm-model-factory';
import {
  DOCUMENT_CATEGORY_VALUES,
  listDocumentCategoryMeta,
} from '../../../domain/dtos/document-category.dto';

interface ClassifierCacheEntry {
  readonly expiresAt: number;
  readonly value: DocumentClassificationResult;
}

interface LlmOutput {
  readonly category: DocumentCategory;
  readonly confidence: number;
  readonly reason: string;
}

export interface DocumentClassifyInput {
  readonly fileName: string;
  readonly mimeType: string;
  readonly pdfText?: string;
}

export interface DocumentClassificationResult {
  readonly category: DocumentCategory;
  readonly confidence: number;
  readonly reason: string;
  readonly source: 'llm' | 'fallback';
  readonly fromCache: boolean;
}

interface ClassifierOptions {
  readonly llmInvoker?: (prompt: string) => Promise<LlmOutput>;
}

const CACHE = new Map<string, ClassifierCacheEntry>();
const MODEL_NAME = process.env.DOCUMENT_CLASSIFIER_MODEL ?? 'gpt-4o-mini';
const CONFIDENCE_THRESHOLD = Number(process.env.DOCUMENT_CLASSIFIER_CONFIDENCE_THRESHOLD ?? 0.55);
const CACHE_TTL_MS = Number(process.env.DOCUMENT_CLASSIFIER_CACHE_TTL_MS ?? 6 * 60 * 60 * 1000);
const TIMEOUT_MS = Number(process.env.DOCUMENT_CLASSIFIER_TIMEOUT_MS ?? 5000);
const PROMPT_VERSION = 'v1';

const ALLOWED = new Set<DocumentCategory>(DOCUMENT_CATEGORY_VALUES);

/**
 * Classifies uploaded documents using LLM structured output.
 *
 * @deprecated For chat PDF extraction routing use {@link resolveFileCategory} +
 * {@link mapPdfExtractionRoute} instead. Kept for integration tests and legacy callers.
 */
export class DocumentClassifierService {
  constructor(private readonly options: ClassifierOptions = {}) {}

  async classify(input: DocumentClassifyInput): Promise<DocumentClassificationResult> {
    const cacheKey = this.buildCacheKey(input);
    const cached = this.getCached(cacheKey);
    if (cached) return cached;
    try {
      const llmOutput = await this.callLlm(input);
      const result: DocumentClassificationResult = {
        category: llmOutput.confidence >= CONFIDENCE_THRESHOLD ? llmOutput.category : 'ALTRO',
        confidence: llmOutput.confidence,
        reason: llmOutput.reason,
        source: llmOutput.confidence >= CONFIDENCE_THRESHOLD ? 'llm' : 'fallback',
        fromCache: false,
      };
      this.setCached(cacheKey, result);
      return result;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      return {
        category: 'ALTRO',
        confidence: 0,
        reason: `classifier_error:${reason}`.slice(0, 220),
        source: 'fallback',
        fromCache: false,
      };
    }
  }

  private buildCacheKey(input: DocumentClassifyInput): string {
    const hash = createHash('sha256');
    hash.update(PROMPT_VERSION);
    hash.update('|');
    hash.update(input.fileName);
    hash.update('|');
    hash.update(input.mimeType);
    hash.update('|');
    hash.update(input.pdfText ?? '');
    return hash.digest('hex');
  }

  private getCached(key: string): DocumentClassificationResult | null {
    const entry = CACHE.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      CACHE.delete(key);
      return null;
    }
    return { ...entry.value, fromCache: true };
  }

  private setCached(key: string, value: DocumentClassificationResult): void {
    CACHE.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  }

  private async callLlm(input: DocumentClassifyInput): Promise<LlmOutput> {
    const prompt = this.buildPrompt(input);
    if (this.options.llmInvoker) {
      return this.options.llmInvoker(prompt);
    }
    const { model: llm } = createChatModel({
      modelName: MODEL_NAME,
      temperature: 0,
      maxTokens: 200,
      timeout: TIMEOUT_MS,
    });
    const response = await llm.invoke(prompt);
    const content = Array.isArray(response.content)
      ? response.content.map((part) => ('text' in part ? part.text : '')).join('\n')
      : String(response.content ?? '');
    const parsed = this.parseLlmJson(content);
    if (!parsed) {
      throw new Error('LLM output is not a valid JSON classification');
    }
    return parsed;
  }

  private buildPrompt(input: DocumentClassifyInput): string {
    const categoriesBlock = listDocumentCategoryMeta()
      .map((meta) => `- ${meta.category}: ${meta.description}`)
      .join('\n');
    const preview = (input.pdfText ?? '').replace(/\s+/g, ' ').trim().slice(0, 1800);
    return `Sei un classificatore di documenti aziendali agricoli italiani.
Restituisci SOLO un oggetto JSON nel formato:
{"category":"<UNA_DELLE_CATEGORIE>","confidence":0.0,"reason":"breve motivazione in italiano"}

Categorie ammesse:
${categoriesBlock}

Regole:
- Scegli UNA sola categoria fra quelle elencate (rispetta esattamente l'enum).
- Se sei incerto o il testo e' vuoto restituisci ALTRO con confidence bassa.
- DDT richiede indizi di trasporto: causale, vettore, destinatario, n. colli, peso.
- FATTURA richiede numero/data fattura, partita IVA, importi e iva.
- ETICHETTA: principio attivo, n. di registrazione ministeriale, dose etichetta, simboli pittogrammi.
- DISCIPLINARE: norme tecniche, principi attivi consentiti, regione/anno disciplinare.
- VISURA_AZIENDALE: visura camerale/catastale con codice fiscale, sede, attivita'.
- FASCICOLO_AZIENDALE: identificazione AGEA, particelle catastali, conduzioni anagrafiche.
- PIANO_COLTURALE: distribuzione colture su particelle/poligoni, superfici, anno colturale.
- MAGAZZINO: registro o report giacenze, carico/scarico, lotti.
- CERTIFICAZIONE: certificato bio/GlobalGAP/IGP/DOP rilasciato da ente terzo.
- NOTA: appunto destrutturato, memorandum, "nota di campo" senza schema fisso.

Input:
- fileName: ${input.fileName}
- mimeType: ${input.mimeType}
- contentPreview: ${preview || 'n/a'}`;
  }

  private parseLlmJson(content: string): LlmOutput | null {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    let parsed: { category?: string; confidence?: number; reason?: string };
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
    const category = parsed.category?.toUpperCase().trim() as DocumentCategory | undefined;
    if (!category || !ALLOWED.has(category)) return null;
    const confidence =
      typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0;
    return {
      category,
      confidence,
      reason: parsed.reason?.slice(0, 220) ?? 'No reason provided',
    };
  }
}

let singleton: DocumentClassifierService | null = null;

export function getDocumentClassifierService(): DocumentClassifierService {
  if (!singleton) singleton = new DocumentClassifierService();
  return singleton;
}
