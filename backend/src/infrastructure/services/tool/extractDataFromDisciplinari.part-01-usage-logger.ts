import { LlmUsageLogger } from '../llm_costs/llm-usage-logger';
import crypto from 'crypto';
import { DisciplinariMetadata, DefenseTarget, DisciplinariRules, ScopeEntity } from '../../../domain/dtos/disciplinari.dto';

export const usageLogger = LlmUsageLogger.getInstance();

/**
 * Executes promises with controlled concurrency.
 */
export async function pMap<T, R>(
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
  readonly pageHint: number | null;
}

/**
 * Checks if a line is likely a heading in a disciplinare document.
 */
export function isHeadingCandidate(line: string): boolean {
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
export function splitTextIntoSections(text: string): Section[] {
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
export interface PartialDisciplinariExtraction {
  readonly documentMetadata: Partial<DisciplinariMetadata> | null;
  readonly scopeEntities: ScopeEntity[];
  readonly rules: Partial<DisciplinariRules> | null;
  readonly defenseTargets: DefenseTarget[];
  readonly extractionConfidence: number;
  readonly extractionErrors: string[];
}
