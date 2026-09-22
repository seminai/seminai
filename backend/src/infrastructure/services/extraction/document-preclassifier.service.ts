import { type DocumentCategory } from '@prisma/client';
import {
  DOCUMENT_CATEGORY_VALUES,
  listDocumentCategoryMeta,
} from '../../../domain/dtos/document-category.dto';
import {
  type CompanyMatchSource,
  type PreclassificationCompany,
  type PreclassificationResult,
} from '../../../domain/dtos/preclassification.dto';
import { fetchChatCompletion, parseChatCompletionResponse } from '../llm-chat-completion-client';

/** Raw shape parsed from the LLM JSON response (untrusted, validated downstream). */
export interface RawPreclassifierOutput {
  readonly documentCategory: string | null;
  readonly categoryConfidence: number;
  readonly companyId: string | null;
  readonly companyConfidence: number;
  readonly reason: string;
}

/** Input to {@link DocumentPreclassifierService.preclassify}. */
export interface PreclassifyInput {
  readonly fileName: string;
  readonly mimeType: string;
  readonly text: string;
  readonly companies: readonly PreclassificationCompany[];
  readonly deterministicCompanyId: string | null;
  readonly deterministicSource: CompanyMatchSource;
  readonly vatHint: string | null;
  readonly deterministicCategory?: DocumentCategory | null;
  readonly deterministicCategoryConfidence?: number;
  readonly deterministicCategoryReason?: string;
}

interface PreclassifierOptions {
  readonly llmInvoker?: (prompt: string) => Promise<RawPreclassifierOutput>;
}

const MODEL_NAME = process.env.PRECLASSIFY_MODEL ?? 'gpt-4o-mini';
const CATEGORY_THRESHOLD = Number(process.env.PRECLASSIFY_CATEGORY_CONFIDENCE_THRESHOLD ?? 0.55);
const COMPANY_THRESHOLD = Number(process.env.PRECLASSIFY_COMPANY_CONFIDENCE_THRESHOLD ?? 0.6);
const MAX_TOKENS = Number(process.env.PRECLASSIFY_MAX_TOKENS ?? 220);
const MIN_USEFUL_TEXT = 10;

const ALLOWED = new Set<DocumentCategory>(DOCUMENT_CATEGORY_VALUES);

function clamp(value: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/**
 * Pre-classifies an uploaded document with a single gpt-4o-mini call that detects
 * both the document category (one of the 11 {@link DocumentCategory} values) and
 * the matching company from the user's list. A deterministic VAT/single-company
 * match always overrides the LLM company field. Below-threshold fields become null
 * so the UI leaves the select empty instead of guessing wrong.
 */
export class DocumentPreclassifierService {
  constructor(private readonly options: PreclassifierOptions = {}) {}

  async preclassify(input: PreclassifyInput): Promise<PreclassificationResult> {
    const raw = await this.runLlm(input);
    const category = this.resolveCategory(input, raw);
    const company = this.resolveCompany(input, raw);
    return {
      documentCategory: category.documentCategory,
      categoryConfidence: category.categoryConfidence,
      companyId: company.companyId,
      companyConfidence: company.companyConfidence,
      companyMatchSource: company.companyMatchSource,
      reason: category.reason ?? raw?.reason?.slice(0, 220) ?? company.fallbackReason,
    };
  }

  private async runLlm(input: PreclassifyInput): Promise<RawPreclassifierOutput | null> {
    if (input.text.trim().length < MIN_USEFUL_TEXT) return null;
    try {
      const prompt = this.buildPrompt(input);
      if (this.options.llmInvoker) return await this.options.llmInvoker(prompt);
      const response = await fetchChatCompletion({
        model: MODEL_NAME,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        maxTokens: MAX_TOKENS,
        responseFormat: { type: 'json_object' },
      });
      const { content } = await parseChatCompletionResponse(response);
      return parseRawOutput(content);
    } catch {
      return null;
    }
  }

  private resolveCategory(
    input: PreclassifyInput,
    raw: RawPreclassifierOutput | null,
  ): {
    documentCategory: DocumentCategory | null;
    categoryConfidence: number;
    reason?: string;
  } {
    const deterministic = input.deterministicCategory;
    const deterministicConfidence = clamp(input.deterministicCategoryConfidence ?? 0);
    if (
      deterministic &&
      ALLOWED.has(deterministic) &&
      deterministicConfidence >= CATEGORY_THRESHOLD
    ) {
      return {
        documentCategory: deterministic,
        categoryConfidence: deterministicConfidence,
        reason: input.deterministicCategoryReason ?? `Categoria abbinata (${deterministic}).`,
      };
    }
    if (!raw) return { documentCategory: null, categoryConfidence: 0 };
    const normalized = raw.documentCategory?.toUpperCase().trim() as DocumentCategory | undefined;
    const confidence = clamp(raw.categoryConfidence);
    if (!normalized || !ALLOWED.has(normalized) || confidence < CATEGORY_THRESHOLD) {
      return { documentCategory: null, categoryConfidence: confidence };
    }
    return { documentCategory: normalized, categoryConfidence: confidence };
  }

  private resolveCompany(
    input: PreclassifyInput,
    raw: RawPreclassifierOutput | null,
  ): {
    companyId: string | null;
    companyConfidence: number;
    companyMatchSource: CompanyMatchSource;
    fallbackReason: string;
  } {
    if (input.deterministicCompanyId) {
      return {
        companyId: input.deterministicCompanyId,
        companyConfidence: 1,
        companyMatchSource: input.deterministicSource,
        fallbackReason: `Azienda abbinata (${input.deterministicSource}).`,
      };
    }
    const ids = new Set(input.companies.map((company) => company.id));
    const confidence = clamp(raw?.companyConfidence ?? 0);
    if (raw?.companyId && ids.has(raw.companyId) && confidence >= COMPANY_THRESHOLD) {
      return {
        companyId: raw.companyId,
        companyConfidence: confidence,
        companyMatchSource: 'llm',
        fallbackReason: 'Azienda abbinata dal modello.',
      };
    }
    return {
      companyId: null,
      companyConfidence: 0,
      companyMatchSource: 'none',
      fallbackReason: 'Nessuna azienda abbinata con sicurezza.',
    };
  }

  private buildPrompt(input: PreclassifyInput): string {
    const categoriesBlock = listDocumentCategoryMeta()
      .map((meta) => `- ${meta.category}: ${meta.description}`)
      .join('\n');
    const companiesBlock = input.companies
      .map(
        (company) =>
          `- id=${company.id} | nome=${company.name} | piva=${company.vatNumber} | cf=${company.fiscalCode} | citta=${company.city ?? 'n/a'}`,
      )
      .join('\n');
    return `Sei un classificatore di documenti aziendali agricoli italiani.
Devi (1) assegnare UNA categoria documentale e (2) abbinare il documento a UNA azienda fra quelle dell'utente.

Restituisci SOLO un oggetto JSON nel formato:
{"documentCategory":"<UNA_CATEGORIA|null>","categoryConfidence":0.0,"companyId":"<id_azienda|null>","companyConfidence":0.0,"reason":"breve motivazione in italiano"}

Categorie ammesse (usa ESATTAMENTE uno di questi valori):
${categoriesBlock}

Aziende dell'utente (abbina per ragione sociale, P.IVA, codice fiscale o citta'; il nome stampato puo' differire o essere assente):
${companiesBlock || '- nessuna azienda disponibile'}

Indizio P.IVA/CF rilevato nel testo: ${input.vatHint ?? 'nessuno'}

Regole:
- documentCategory: scegli UNA categoria; se incerto o testo vuoto usa null con confidence bassa.
- companyId: deve essere ESATTAMENTE un id della lista sopra, oppure null. MAI inventare nomi.
- Se un'azienda combacia per P.IVA/CF assegna alta confidence anche se il nome differisce.
- Non scegliere un'azienda solo perche' plausibile: serve un indizio reale nel testo.

Documento:
- fileName: ${input.fileName}
- mimeType: ${input.mimeType}
- contentPreview: ${input.text || 'n/a'}`;
  }
}

function parseRawOutput(content: string): RawPreclassifierOutput | null {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: Partial<RawPreclassifierOutput>;
  try {
    parsed = JSON.parse(match[0]) as Partial<RawPreclassifierOutput>;
  } catch {
    return null;
  }
  return {
    documentCategory: typeof parsed.documentCategory === 'string' ? parsed.documentCategory : null,
    categoryConfidence:
      typeof parsed.categoryConfidence === 'number' ? parsed.categoryConfidence : 0,
    companyId: typeof parsed.companyId === 'string' ? parsed.companyId : null,
    companyConfidence: typeof parsed.companyConfidence === 'number' ? parsed.companyConfidence : 0,
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
  };
}

let singleton: DocumentPreclassifierService | null = null;

export function getDocumentPreclassifierService(): DocumentPreclassifierService {
  if (!singleton) singleton = new DocumentPreclassifierService();
  return singleton;
}
