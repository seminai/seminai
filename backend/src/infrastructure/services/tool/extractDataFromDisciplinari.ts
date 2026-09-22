import { createChatModel } from '../llm-model-factory';
import { PromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { LlmJobType } from '@prisma/client';
import { LlmUsageLogger } from '../llm_costs/llm-usage-logger';
import {
  DisciplinariExtractedData,
  DisciplinariMetadata,
  DefenseTarget,
  AllowedIntervention,
  DisciplinariRules,
  ScopeEntity,
} from '../../../domain/dtos/disciplinari.dto';
import crypto from 'crypto';

const usageLogger = LlmUsageLogger.getInstance();

/**
 * Executes promises with controlled concurrency.
 */
async function pMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Context for disciplinari extraction operations.
 */
export interface DisciplinariExtractionContext {
  readonly userId?: string;
  readonly companyId?: string;
  readonly jobId?: string;
  readonly jobGroupId?: string;
}

/**
 * Result of text extraction from PDF.
 */
export interface DisciplinariTextResult {
  readonly text: string;
  readonly pageCount: number;
  readonly fileHash: string;
}

/**
 * Calculates SHA256 hash of a buffer.
 */
export function calculateFileHash(buffer: Buffer): string {
  return crypto
    .createHash('sha256')
    .update(buffer as crypto.BinaryLike)
    .digest('hex');
}

/**
 * Estimates token count from text (rough estimate: 1 token ≈ 4 characters).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Splits text into chunks with overlap to avoid losing context at boundaries.
 */
function splitTextIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start += chunkSize - overlap;
  }
  return chunks;
}

interface Section {
  readonly title: string;
  readonly content: string;
  readonly pageHint: number | null;
}

/**
 * Checks if a line is likely a heading in a disciplinare document.
 */
function isHeadingCandidate(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('#')) return true;
  if (trimmed.length < 4 || trimmed.length > 200) return false;
  const alphaChars = trimmed.replace(/[^A-Za-zÀ-Üà-ü]/g, '').length;
  if (alphaChars < 4) return false;
  const uppercaseChars = trimmed.replace(/[^A-ZÀ-Ü]/g, '').length;
  const uppercaseRatio = alphaChars > 0 ? uppercaseChars / alphaChars : 0;
  if (uppercaseRatio >= 0.6) return true;
  if (/^[0-9]+\s*[.)-]/.test(trimmed)) return true;
  if (/:\s*$/.test(trimmed)) return true;
  if (/^(DIFESA|DISERBO|COLTURA|AVVERSITÀ|INTERVENTI|TABELLA)/i.test(trimmed)) return true;
  return false;
}

/**
 * Splits text into sections based on headings.
 */
function splitTextIntoSections(text: string): Section[] {
  const lines = text.split(/\r?\n/);
  const sections: Section[] = [];
  let currentTitle = 'INTRODUZIONE';
  let buffer: string[] = [];
  let currentPage: number | null = null;

  const pushSection = (): void => {
    const content = buffer.join('\n').trim();
    if (content.length > 0) {
      sections.push({ title: currentTitle, content, pageHint: currentPage });
    }
    buffer = [];
  };

  for (const rawLine of lines) {
    const pageMatch = rawLine.match(/^\s*-{3,}\s*Pagina?\s*(\d+)\s*-{3,}\s*$/i);
    if (pageMatch) {
      currentPage = parseInt(pageMatch[1], 10);
      continue;
    }
    if (isHeadingCandidate(rawLine)) {
      pushSection();
      currentTitle = rawLine.replace(/^#+\s*/, '').trim() || 'SEZIONE';
    } else {
      buffer.push(rawLine);
    }
  }

  pushSection();
  return sections;
}

/**
 * Builds chunks from sections respecting max character limit.
 */
function buildSectionChunks(sections: Section[], maxChars: number): string[] {
  if (sections.length === 0) {
    return [];
  }
  const chunks: string[] = [];
  let currentChunk = '';

  const appendChunk = (text: string): void => {
    if (currentChunk.length === 0) {
      currentChunk = text;
    } else if (currentChunk.length + text.length <= maxChars) {
      currentChunk += `\n${text}`;
    } else {
      chunks.push(currentChunk);
      currentChunk = text;
    }
  };

  sections.forEach((section) => {
    const pageInfo = section.pageHint ? ` [Pagina ${section.pageHint}]` : '';
    const payload = `## ${section.title}${pageInfo}\n${section.content}`;
    if (payload.length > maxChars) {
      const subChunks = splitTextIntoChunks(
        payload,
        maxChars,
        Math.min(2000, Math.floor(maxChars / 4)),
      );
      subChunks.forEach((chunk) => appendChunk(chunk));
    } else {
      appendChunk(payload);
    }
  });

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  return chunks;
}

/**
 * Partial extraction result from a single chunk.
 */
interface PartialDisciplinariExtraction {
  readonly documentMetadata: Partial<DisciplinariMetadata> | null;
  readonly scopeEntities: ScopeEntity[];
  readonly rules: Partial<DisciplinariRules> | null;
  readonly defenseTargets: DefenseTarget[];
  readonly extractionConfidence: number;
  readonly extractionErrors: string[];
}

/**
 * Prompt for extracting structured data from disciplinari text.
 */
const EXTRACTION_PROMPT = `Sei un esperto nell'estrazione di dati strutturati da disciplinari di produzione integrata italiani.
Analizza il seguente testo estratto da un disciplinare PDF e estrai le informazioni strutturate.

IMPORTANTE: I disciplinari contengono tabelle con informazioni su:
- Sostanze attive/prodotti ammessi
- Dosi minime e massime (in varie unità: kg/ha, L/ha, g/hl, %)
- Numero massimo di interventi (per anno, ciclo, stagione)
- Intervalli minimi tra trattamenti (giorni)
- Finestre fenologiche (stadi BBCH o descrizioni)
- Vincoli e limitazioni

LINEE GUIDA ESTRAZIONE:
1. METADATI DOCUMENTO: Cerca nel testo:
   - Regione (es. "Emilia-Romagna", "Piemonte")
   - Anno (es. "2025", "Anno 2024")
   - Versione (es. "Rev. 1", "Versione 2.0")
   - Titolo (es. "Disciplinari di Produzione Integrata - Difesa")
   - Date validità: cerca frasi come "Valido dal", "In vigore fino al", "Anno di riferimento"

2. REGOLE GENERALI: Estrai:
   - Principi generali (priorità mezzi agronomici, soglie, etc.)
   - Divieti espliciti
   - Azioni obbligatorie (monitoraggi, registrazioni)

3. INTERVENTI AMMESSI: Per ogni riga/voce trovata:
   - Nome sostanza attiva o prodotto
   - Dose minima e massima con unità di misura
   - Numero massimo interventi e ambito (anno/ciclo)
   - Intervallo minimo giorni tra trattamenti
   - Stadio fenologico ammesso (BBCH o descrizione)
   - Note e vincoli

4. NORMALIZZAZIONE:
   - Converti range come "1,5-2 kg/ha" in min: 1.5, max: 2.0, unit: "kg/ha"
   - Se solo un valore (es. "2 kg/ha"), usa lo stesso per min e max
   - Estrai "max 3 interventi/anno" come applications.max: 3, applications.scope: "anno"

SCHEMA JSON RICHIESTO:
{{
  "documentMetadata": {{
    "region": "string o null",
    "year": number o null,
    "version": "string o null",
    "title": "string o null",
    "sourceUrlOrFile": null,
    "validFrom": "YYYY-MM-DD o null",
    "validUntil": "YYYY-MM-DD o null",
    "isExpired": false
  }},
  "scopeEntities": [
    {{
      "crop": {{ "name": "string", "group": "string o null" }},
      "section": {{ "name": "string" }},
      "subsection": {{ "name": "string o null" }} o null
    }}
  ],
  "rules": {{
    "generalPrinciples": ["string"],
    "prohibitions": ["string"],
    "mandatoryActions": ["string"],
    "definitions": [{{ "term": "string", "definition": "string" }}]
  }},
  "defenseTargets": [
    {{
      "target": {{ "name": "string", "type": "insetto|fungo|infestante|altro" }},
      "monitoring": ["string"],
      "agronomicMeasures": ["string"],
      "biologicalMeasures": ["string"],
      "interventions": [
        {{
          "productOrActive": {{ "name": "string", "normalized": "string o null" }},
          "formulation": "string o null",
          "dose": {{
            "min": number o null,
            "max": number o null,
            "unit": "string o null",
            "notes": "string o null"
          }},
          "applications": {{
            "min": number o null,
            "max": number o null,
            "scope": "anno|ciclo colturale|stagione|finestra fenologica|null"
          }},
          "interval": {{ "minDays": number o null }},
          "phi": {{ "preharvestIntervalDays": number o null }} o null,
          "phenology": {{ "from": "string o null", "to": "string o null" }},
          "constraints": ["string"],
          "environmentalConstraints": ["string"],
          "resistanceManagement": ["string"],
          "notes": "string o null",
          "sourceLocator": {{
            "page": number o null,
            "tableId": "string o null",
            "rowHint": "string o null"
          }}
        }}
      ]
    }}
  ],
  "extractionConfidence": number (0-100),
  "extractionErrors": ["string"]
}}

TESTO DA ANALIZZARE:
{text}

{format_instructions}

Rispondi SOLO con il JSON nello schema esatto sopra, senza testo aggiuntivo.`;

/**
 * Extracts structured data from a single text chunk.
 */
async function extractSingleChunk(
  text: string,
  chunkIndex: number,
  totalChunks: number,
  callbacks?: ReadonlyArray<BaseCallbackHandler>,
  context?: DisciplinariExtractionContext,
): Promise<PartialDisciplinariExtraction> {
  const modelName = process.env.OPENAI_MODEL || 'gpt-4o';
  const estimatedTokens = estimateTokens(text);
  const MAX_SAFE_TOKENS = 50000; // Safety limit per chunk

  console.log(
    `[DISCIPLINARI_EXTRACTION] Processing chunk ${chunkIndex + 1}/${totalChunks} with model: ${modelName}, estimated tokens: ${estimatedTokens}`,
  );

  // Safety check: if chunk is still too large, split it further
  if (estimatedTokens > MAX_SAFE_TOKENS) {
    console.warn(
      `[DISCIPLINARI_EXTRACTION] Chunk ${chunkIndex + 1} is too large (${estimatedTokens} tokens), splitting further...`,
    );
    const subChunks = splitTextIntoChunks(text, MAX_SAFE_TOKENS * 3.5, MAX_SAFE_TOKENS * 1.5);
    const subPartials: PartialDisciplinariExtraction[] = [];
    for (let i = 0; i < subChunks.length; i++) {
      const subPartial = await extractSingleChunk(
        subChunks[i],
        chunkIndex,
        totalChunks,
        callbacks,
        context,
      );
      subPartials.push(subPartial);
    }
    // Merge sub-partials manually
    if (subPartials.length === 0) {
      return {
        documentMetadata: null,
        scopeEntities: [],
        rules: null,
        defenseTargets: [],
        extractionConfidence: 0,
        extractionErrors: [`Chunk ${chunkIndex + 1} was split but no results obtained`],
      };
    }
    if (subPartials.length === 1) {
      return subPartials[0];
    }
    // Simple merge: combine all arrays, use first non-null metadata
    const merged: PartialDisciplinariExtraction = {
      documentMetadata:
        subPartials.find((p) => p.documentMetadata !== null)?.documentMetadata ?? null,
      scopeEntities: subPartials.flatMap((p) => p.scopeEntities),
      rules: subPartials.find((p) => p.rules !== null)?.rules ?? null,
      defenseTargets: subPartials.flatMap((p) => p.defenseTargets),
      extractionConfidence: Math.round(
        subPartials.reduce((sum, p) => sum + p.extractionConfidence, 0) / subPartials.length,
      ),
      extractionErrors: subPartials.flatMap((p) => p.extractionErrors),
    };
    return merged;
  }

  const { model: llm, modelName: resolvedModelName } = createChatModel({
    modelName,
    temperature: 0,
    maxTokens: 16000,
  });

  const tracker = usageLogger.createTracker(callbacks);
  const parser = new JsonOutputParser<PartialDisciplinariExtraction>();

  const prompt = PromptTemplate.fromTemplate(EXTRACTION_PROMPT);
  const chain = prompt.pipe(llm).pipe(parser);

  try {
    const result = await chain.invoke(
      {
        text,
        format_instructions: parser.getFormatInstructions(),
      },
      { callbacks: tracker.callbacks },
    );

    await usageLogger.logFromAccumulator(tracker.accumulator, {
      userId: context?.userId,
      companyId: context?.companyId,
      jobId: context?.jobId,
      jobGroupId: context?.jobGroupId,
      jobType: LlmJobType.LABEL,
      model: resolvedModelName,
      metadata: { step: 'disciplinari-chunk-extraction', chunkIndex, totalChunks },
    });

    return result;
  } catch (error) {
    console.error(`[DISCIPLINARI_EXTRACTION] Error extracting chunk ${chunkIndex + 1}:`, error);
    return {
      documentMetadata: null,
      scopeEntities: [],
      rules: null,
      defenseTargets: [],
      extractionConfidence: 0,
      extractionErrors: [
        `Chunk ${chunkIndex + 1} extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ],
    };
  }
}

/**
 * Merges multiple partial extractions into a single coherent result.
 */
async function mergePartialExtractions(
  partials: PartialDisciplinariExtraction[],
  callbacks?: ReadonlyArray<BaseCallbackHandler>,
  context?: DisciplinariExtractionContext,
): Promise<DisciplinariExtractedData> {
  const modelName = process.env.OPENAI_MODEL || 'gpt-4o';
  console.log(
    `[DISCIPLINARI_EXTRACTION] Merging ${partials.length} partial extractions with model: ${modelName}`,
  );

  const { model: llm, modelName: resolvedModelName } = createChatModel({
    modelName,
    temperature: 0,
    maxTokens: 16000,
  });

  const tracker = usageLogger.createTracker(callbacks);
  const parser = new JsonOutputParser<DisciplinariExtractedData>();

  const mergePrompt = PromptTemplate.fromTemplate(`
Sei un esperto di data integration. Ti vengono forniti più oggetti JSON parziali estratti da diverse sezioni dello stesso disciplinare.
Il tuo compito è unire questi oggetti in un UNICO oggetto coerente.

REGOLE DI MERGE:
- documentMetadata: usa i valori non-null più completi, preferisci date specifiche
- scopeEntities: unisci eliminando duplicati basati su crop.name + section.name
- rules: unisci tutti gli array eliminando stringhe duplicate
- defenseTargets: unisci per target.name, aggregando gli interventions di target con stesso nome
- interventions: unisci eliminando duplicati basati su productOrActive.name + dose
- extractionConfidence: usa la media dei valori
- extractionErrors: unisci tutti gli errori

VALIDAZIONE DATE:
- Se validUntil < oggi, imposta isExpired = true
- Se manca validUntil ma c'è year, calcola validUntil = year-12-31

NORMALIZZAZIONE:
- Assicurati che tutti i campi required abbiano valori validi
- Imposta valori di default dove mancanti (array vuoti, null per opzionali)

OGGETTI PARZIALI DA UNIRE:
{partials}

{format_instructions}

Rispondi SOLO con il JSON unificato, senza testo aggiuntivo.
`);

  const chain = mergePrompt.pipe(llm).pipe(parser);

  try {
    const result = await chain.invoke(
      {
        partials: JSON.stringify(partials, null, 2),
        format_instructions: parser.getFormatInstructions(),
      },
      { callbacks: tracker.callbacks },
    );

    await usageLogger.logFromAccumulator(tracker.accumulator, {
      userId: context?.userId,
      companyId: context?.companyId,
      jobId: context?.jobId,
      jobGroupId: context?.jobGroupId,
      jobType: LlmJobType.LABEL,
      model: resolvedModelName,
      metadata: { step: 'disciplinari-merge', partialsCount: partials.length },
    });

    return sanitizeDisciplinariExtraction(result);
  } catch (error) {
    console.error('[DISCIPLINARI_EXTRACTION] Error merging partials:', error);
    return createEmptyExtraction([
      `Merge failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    ]);
  }
}

/**
 * Creates an empty extraction result with default values.
 */
function createEmptyExtraction(errors: string[] = []): DisciplinariExtractedData {
  return {
    documentMetadata: {
      region: 'Unknown',
      year: new Date().getFullYear(),
      version: null,
      title: 'Unknown',
      sourceUrlOrFile: null,
      validFrom: null,
      validUntil: null,
      isExpired: false,
    },
    scopeEntities: [],
    rules: {
      generalPrinciples: [],
      prohibitions: [],
      mandatoryActions: [],
      definitions: [],
    },
    defenseTargets: [],
    normalizationOutputs: null,
    extractionConfidence: 0,
    extractionErrors: errors,
  };
}

/**
 * Sanitizes and validates the extracted data.
 */
function sanitizeDisciplinariExtraction(raw: unknown): DisciplinariExtractedData {
  if (!raw || typeof raw !== 'object') {
    return createEmptyExtraction(['Invalid extraction result']);
  }

  const data = raw as Record<string, unknown>;

  const metadata = sanitizeMetadata(data.documentMetadata);
  const scopeEntities = sanitizeScopeEntities(data.scopeEntities);
  const rules = sanitizeRules(data.rules);
  const defenseTargets = sanitizeDefenseTargets(data.defenseTargets);

  const confidence =
    typeof data.extractionConfidence === 'number'
      ? Math.min(100, Math.max(0, data.extractionConfidence))
      : 50;

  const errors = Array.isArray(data.extractionErrors)
    ? data.extractionErrors.filter((e): e is string => typeof e === 'string')
    : [];

  return {
    documentMetadata: metadata,
    scopeEntities,
    rules,
    defenseTargets,
    normalizationOutputs: null,
    extractionConfidence: confidence,
    extractionErrors: errors,
  };
}

function sanitizeMetadata(raw: unknown): DisciplinariMetadata {
  const defaultMetadata: DisciplinariMetadata = {
    region: 'Unknown',
    year: new Date().getFullYear(),
    version: null,
    title: 'Unknown',
    sourceUrlOrFile: null,
    validFrom: null,
    validUntil: null,
    isExpired: false,
  };

  if (!raw || typeof raw !== 'object') {
    return defaultMetadata;
  }

  const data = raw as Record<string, unknown>;

  const year =
    typeof data.year === 'number'
      ? data.year
      : parseInt(String(data.year), 10) || defaultMetadata.year;

  let validUntil = typeof data.validUntil === 'string' ? data.validUntil : null;
  if (!validUntil && year) {
    validUntil = `${year}-12-31`;
  }

  const isExpired = validUntil ? new Date(validUntil) < new Date() : false;

  return {
    region: typeof data.region === 'string' ? data.region : defaultMetadata.region,
    year,
    version: typeof data.version === 'string' ? data.version : null,
    title: typeof data.title === 'string' ? data.title : defaultMetadata.title,
    sourceUrlOrFile: typeof data.sourceUrlOrFile === 'string' ? data.sourceUrlOrFile : null,
    validFrom: typeof data.validFrom === 'string' ? data.validFrom : null,
    validUntil,
    isExpired,
  };
}

function sanitizeScopeEntities(raw: unknown): ScopeEntity[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    .map((item) => ({
      crop: {
        name:
          typeof item.crop === 'object' && item.crop !== null
            ? String((item.crop as Record<string, unknown>).name || 'Unknown')
            : 'Unknown',
        group:
          typeof item.crop === 'object' && item.crop !== null
            ? ((item.crop as Record<string, unknown>).group as string) || null
            : null,
      },
      section: {
        name:
          typeof item.section === 'object' && item.section !== null
            ? String((item.section as Record<string, unknown>).name || 'Unknown')
            : 'Unknown',
      },
      subsection:
        typeof item.subsection === 'object' && item.subsection !== null
          ? { name: ((item.subsection as Record<string, unknown>).name as string) || null }
          : null,
    }));
}

function sanitizeRules(raw: unknown): DisciplinariRules {
  const defaultRules: DisciplinariRules = {
    generalPrinciples: [],
    prohibitions: [],
    mandatoryActions: [],
    definitions: [],
  };

  if (!raw || typeof raw !== 'object') {
    return defaultRules;
  }

  const data = raw as Record<string, unknown>;

  return {
    generalPrinciples: sanitizeStringArray(data.generalPrinciples),
    prohibitions: sanitizeStringArray(data.prohibitions),
    mandatoryActions: sanitizeStringArray(data.mandatoryActions),
    definitions: Array.isArray(data.definitions)
      ? data.definitions
          .filter((d): d is Record<string, unknown> => d !== null && typeof d === 'object')
          .map((d) => ({
            term: String(d.term || ''),
            definition: String(d.definition || ''),
          }))
      : [],
  };
}

function sanitizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item): item is string => typeof item === 'string');
}

function sanitizeDefenseTargets(raw: unknown): DefenseTarget[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    .map((item) => ({
      target: {
        name:
          typeof item.target === 'object' && item.target !== null
            ? String((item.target as Record<string, unknown>).name || 'Unknown')
            : 'Unknown',
        type: sanitizeTargetType(
          typeof item.target === 'object' && item.target !== null
            ? (item.target as Record<string, unknown>).type
            : 'altro',
        ),
      },
      monitoring: sanitizeStringArray(item.monitoring),
      agronomicMeasures: sanitizeStringArray(item.agronomicMeasures),
      biologicalMeasures: sanitizeStringArray(item.biologicalMeasures),
      interventions: sanitizeInterventions(item.interventions),
    }));
}

function sanitizeTargetType(raw: unknown): 'insetto' | 'fungo' | 'infestante' | 'altro' {
  const valid = ['insetto', 'fungo', 'infestante', 'altro'];
  const value = String(raw || 'altro').toLowerCase();
  return valid.includes(value) ? (value as 'insetto' | 'fungo' | 'infestante' | 'altro') : 'altro';
}

function sanitizeInterventions(raw: unknown): AllowedIntervention[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    .map((item) => ({
      productOrActive: {
        name:
          typeof item.productOrActive === 'object' && item.productOrActive !== null
            ? String((item.productOrActive as Record<string, unknown>).name || 'Unknown')
            : 'Unknown',
        normalized:
          typeof item.productOrActive === 'object' && item.productOrActive !== null
            ? ((item.productOrActive as Record<string, unknown>).normalized as string) || null
            : null,
      },
      formulation: typeof item.formulation === 'string' ? item.formulation : null,
      dose: sanitizeDose(item.dose),
      applications: sanitizeApplications(item.applications),
      interval: {
        minDays:
          typeof item.interval === 'object' && item.interval !== null
            ? ((item.interval as Record<string, unknown>).minDays as number) || null
            : null,
      },
      phi:
        typeof item.phi === 'object' && item.phi !== null
          ? {
              preharvestIntervalDays:
                ((item.phi as Record<string, unknown>).preharvestIntervalDays as number) || null,
            }
          : null,
      phenology: {
        from:
          typeof item.phenology === 'object' && item.phenology !== null
            ? ((item.phenology as Record<string, unknown>).from as string) || null
            : null,
        to:
          typeof item.phenology === 'object' && item.phenology !== null
            ? ((item.phenology as Record<string, unknown>).to as string) || null
            : null,
      },
      constraints: sanitizeStringArray(item.constraints),
      environmentalConstraints: sanitizeStringArray(item.environmentalConstraints),
      resistanceManagement: sanitizeStringArray(item.resistanceManagement),
      notes: typeof item.notes === 'string' ? item.notes : null,
      sourceLocator: {
        page:
          typeof item.sourceLocator === 'object' && item.sourceLocator !== null
            ? ((item.sourceLocator as Record<string, unknown>).page as number) || null
            : null,
        tableId:
          typeof item.sourceLocator === 'object' && item.sourceLocator !== null
            ? ((item.sourceLocator as Record<string, unknown>).tableId as string) || null
            : null,
        rowHint:
          typeof item.sourceLocator === 'object' && item.sourceLocator !== null
            ? ((item.sourceLocator as Record<string, unknown>).rowHint as string) || null
            : null,
      },
    }));
}

function sanitizeDose(raw: unknown): {
  min: number | null;
  max: number | null;
  unit: string | null;
  notes: string | null;
} {
  if (!raw || typeof raw !== 'object') {
    return { min: null, max: null, unit: null, notes: null };
  }

  const data = raw as Record<string, unknown>;
  return {
    min: typeof data.min === 'number' ? data.min : null,
    max: typeof data.max === 'number' ? data.max : null,
    unit: typeof data.unit === 'string' ? data.unit : null,
    notes: typeof data.notes === 'string' ? data.notes : null,
  };
}

function sanitizeApplications(raw: unknown): {
  min: number | null;
  max: number | null;
  scope: 'anno' | 'ciclo colturale' | 'stagione' | 'finestra fenologica' | null;
} {
  if (!raw || typeof raw !== 'object') {
    return { min: null, max: null, scope: null };
  }

  const data = raw as Record<string, unknown>;
  const validScopes = ['anno', 'ciclo colturale', 'stagione', 'finestra fenologica'];
  const scope =
    typeof data.scope === 'string' && validScopes.includes(data.scope) ? data.scope : null;

  return {
    min: typeof data.min === 'number' ? data.min : null,
    max: typeof data.max === 'number' ? data.max : null,
    scope: scope as 'anno' | 'ciclo colturale' | 'stagione' | 'finestra fenologica' | null,
  };
}

/**
 * Main function to extract structured data from disciplinari text.
 * Implements chunking for long documents (50+ pages).
 */
export async function extractStructuredDisciplinariData(
  text: string,
  callbacks?: ReadonlyArray<BaseCallbackHandler>,
  context?: DisciplinariExtractionContext,
): Promise<DisciplinariExtractedData> {
  const inputText = text || '';
  const estimatedTokens_count = estimateTokens(inputText);
  // Reduced to 50000 tokens per chunk to leave room for prompt (~20k) and response (~10k) (GPT-4o limit is 128k)
  const MAX_TOKENS_PER_CHUNK = 50000;
  const MAX_CHARS_PER_CHUNK = MAX_TOKENS_PER_CHUNK * 3.5; // Conservative estimate: 3.5 chars per token

  console.log(
    `[DISCIPLINARI_EXTRACTION] Starting extraction. Estimated tokens: ${estimatedTokens_count}, chars: ${inputText.length}`,
  );

  if (inputText.length === 0) {
    return createEmptyExtraction(['Empty input text']);
  }

  if (estimatedTokens_count <= MAX_TOKENS_PER_CHUNK) {
    console.log('[DISCIPLINARI_EXTRACTION] Single chunk extraction');
    const result = await extractSingleChunk(inputText, 0, 1, callbacks, context);
    return sanitizeDisciplinariExtraction(result);
  }

  console.log('[DISCIPLINARI_EXTRACTION] Multi-chunk extraction required');
  const sections = splitTextIntoSections(inputText);
  console.log(`[DISCIPLINARI_EXTRACTION] Found ${sections.length} sections`);

  const chunks = buildSectionChunks(sections, MAX_CHARS_PER_CHUNK);
  console.log(`[DISCIPLINARI_EXTRACTION] Split into ${chunks.length} chunks`);

  // Process chunks in parallel with controlled concurrency (max 4 concurrent)
  const CHUNK_CONCURRENCY = 4;
  console.log(
    `[DISCIPLINARI_EXTRACTION] Processing ${chunks.length} chunks with concurrency ${CHUNK_CONCURRENCY}`,
  );

  const partials = await pMap(
    chunks,
    async (chunk, i) => extractSingleChunk(chunk, i, chunks.length, callbacks, context),
    CHUNK_CONCURRENCY,
  );

  if (partials.length === 1) {
    return sanitizeDisciplinariExtraction(partials[0]);
  }

  return mergePartialExtractions(partials, callbacks, context);
}

/**
 * Extracts validity dates from text using regex patterns.
 * This is a lightweight extraction that runs before LLM.
 */
export function extractValidityDatesFromText(text: string): {
  validFrom: string | null;
  validUntil: string | null;
  year: number | null;
} {
  let validFrom: string | null = null;
  let validUntil: string | null = null;
  let year: number | null = null;

  const yearMatch = text.match(/Anno\s*(\d{4})/i) || text.match(/(\d{4})\s*[-–]\s*(\d{4})/);
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
    if (!validUntil) {
      validUntil = `${year}-12-31`;
    }
  }

  const validFromMatch = text.match(/[Vv]alido\s+dal[:\s]*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (validFromMatch) {
    const [, day, month, yr] = validFromMatch;
    validFrom = `${yr}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const validUntilMatch = text.match(
    /[Vv]alido\s+(?:fino\s+al|al)[:\s]*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
  );
  if (validUntilMatch) {
    const [, day, month, yr] = validUntilMatch;
    validUntil = `${yr}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const inVigorMatch = text.match(
    /[Ii]n\s+vigore\s+(?:fino\s+al|dal)[:\s]*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
  );
  if (inVigorMatch) {
    const [, day, month, yr] = inVigorMatch;
    const date = `${yr}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    if (text.toLowerCase().includes('fino')) {
      validUntil = date;
    } else {
      validFrom = date;
    }
  }

  return { validFrom, validUntil, year };
}

/**
 * Checks if a disciplinare is expired based on validUntil date.
 */
export function isDisciplinareExpired(validUntil: Date | string | null): boolean {
  if (!validUntil) {
    return false;
  }
  const expiryDate = typeof validUntil === 'string' ? new Date(validUntil) : validUntil;
  return expiryDate < new Date();
}
