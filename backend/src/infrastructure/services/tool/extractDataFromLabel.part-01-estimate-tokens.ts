import { LlmUsageLogger } from '../llm_costs/llm-usage-logger';
import { Label } from '../../../domain/dtos/label.dto';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { DosageAgentContext, hasContext } from '../../services/agents/dosage_agent/context';
import { DosageLoggerService } from '../dosage-logger.service';
import { createChatModel } from '../llm-model-factory';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { LlmJobType } from '@prisma/client';
import { sanitizeLabel } from '../utils/cleanText';

// types moved to domain: Label, LabelTextResult

/**
 * Estimates token count from text (rough estimate: 1 token ≈ 4 characters for English/Italian)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Splits text into chunks with overlap to avoid losing context at boundaries.
 */
export function splitTextIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
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

export interface Section {
  readonly title: string;
  readonly content: string;
}

export const usageLogger = LlmUsageLogger.getInstance();

export function isHeadingCandidate(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('#')) return true;
  if (trimmed.length < 4 || trimmed.length > 160) return false;
  const alphaChars = trimmed.replace(/[^A-Za-zÀ-Üà-ü]/g, '').length;
  if (alphaChars < 4) return false;
  const uppercaseChars = trimmed.replace(/[^A-ZÀ-Ü]/g, '').length;
  const uppercaseRatio = alphaChars > 0 ? uppercaseChars / alphaChars : 0;
  if (uppercaseRatio >= 0.7) return true;
  if (/^[0-9]+\s*[.)-]/.test(trimmed)) return true;
  if (/:\s*$/.test(trimmed)) return true;
  return false;
}

export function splitTextIntoSections(text: string): Section[] {
  const lines = text.split(/\r?\n/);
  const sections: Section[] = [];
  let currentTitle = 'INTRODUZIONE';
  let buffer: string[] = [];

  const pushSection = (): void => {
    const content = buffer.join('\n').trim();
    if (content.length > 0) {
      sections.push({ title: currentTitle, content });
    }
    buffer = [];
  };

  for (const rawLine of lines) {
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

export function buildSectionChunks(sections: Section[], maxChars: number): string[] {
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
    const payload = `## ${section.title}\n${section.content}`;
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
 * Merges multiple partial Label objects into a single coherent Label using LLM.
 */
export async function mergePartialLabels(
  partials: Label[],
  callbacks?: ReadonlyArray<BaseCallbackHandler>,
  context?: DosageAgentContext,
): Promise<Label> {
  const modelForMerge = process.env.OPENAI_MODEL || 'gpt-4o';
  const message = `Merging with model: ${modelForMerge}`;
  console.log(`[LABEL_EXTRACTION] ${message}`);

  if (hasContext(context)) {
    const logger = DosageLoggerService.getInstance();
    logger.logLabelExtraction({
      jobId: context.jobId,
      userId: context.userId,
      message,
      metadata: { model: modelForMerge, partialsCount: partials.length },
    });
  }
  const { model: llm } = createChatModel({
    modelName: modelForMerge,
    temperature: 0,
    maxTokens: 16000,
  });
  const tracker = usageLogger.createTracker(callbacks);
  const parser = new JsonOutputParser<Label>();
  const prompt = PromptTemplate.fromTemplate(`
Sei un esperto di data integration. Ti vengono forniti più oggetti JSON parziali estratti da diverse sezioni dello stesso documento.
Il tuo compito è unire questi oggetti in un UNICO oggetto coerente seguendo queste regole:

REGOLE DI MERGE:
- Per campi stringa: usa il valore non-null più completo/descrittivo
- Per array: unisci eliminando duplicati, mantieni tutti i valori unici
- Per numeri: usa il valore presente, in caso di conflitto usa il più conservativo (es. dose minima più bassa, dose massima più alta)
- Per dosaggi_dettagliati: unisci tutte le voci, elimina duplicati esatti, mantieni variazioni legittime (stessa coltura ma dosi diverse per epoche diverse)
- Per resistenze: unisci tutte le voci, elimina duplicati esatti basati sul testo_completo o sulla combinazione di prodotti_da_evitare e colture_interessate
- extraction_confidence: usa la media dei valori
- extracted_fields: unisci tutti i campi estratti
- errors: unisci tutti gli errori

OGGETTI PARZIALI DA UNIRE:
{partials}

{format_instructions}

Rispondi SOLO con il JSON unificato, senza testo aggiuntivo.
`);
  const chain = prompt.pipe(llm).pipe(parser);
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
    jobType: context?.jobType ?? LlmJobType.LABEL,
    model: modelForMerge,
    metadata: { step: 'merge-partials', partialsCount: partials.length },
  });
  return sanitizeLabel(result);
}
