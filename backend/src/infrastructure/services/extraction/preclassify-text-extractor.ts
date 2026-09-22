import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { type DocumentCategory } from '@prisma/client';
import { pdfToText } from '../ocr/pdfToText';
import {
  extractTextFromImageWithGptVision,
  extractTextFromPdfPathWithGptVision,
} from '../ocr/gptVision';
import { resolveFileFormat } from './file-format-resolver';
import { inspectZipForPreclassification } from './preclassify-zip-inspector';

/** Extracted text plus whether the slow vision OCR path was used. */
export interface PreclassifyTextResult {
  readonly text: string;
  readonly usedVision: boolean;
}

/** Full pre-classification extraction context, including optional ZIP category hints. */
export interface PreclassifyContext extends PreclassifyTextResult {
  readonly deterministicCategory: DocumentCategory | null;
  readonly categoryConfidence: number;
  readonly categoryReason: string;
}

const TRUNCATE_CHARS = Number(process.env.PRECLASSIFY_TEXT_TRUNCATE_CHARS ?? 2000);
const MIN_USEFUL_TEXT = 40;
const TEXT_MIME_PREFIXES = ['text/', 'application/xml'];

function truncate(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, TRUNCATE_CHARS);
}

function emptyContext(text = '', usedVision = false): PreclassifyContext {
  return {
    text,
    usedVision,
    deterministicCategory: null,
    categoryConfidence: 0,
    categoryReason: '',
  };
}

async function withTempFile<T>(
  buffer: Buffer,
  extension: string,
  use: (filePath: string) => Promise<T>,
): Promise<T> {
  const filePath = path.join(os.tmpdir(), `preclassify-${uuid()}${extension}`);
  fs.writeFileSync(filePath, new Uint8Array(buffer));
  try {
    return await use(filePath);
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

async function extractFromPdf(buffer: Buffer): Promise<PreclassifyTextResult> {
  const { text } = await pdfToText(buffer);
  if (text.trim().length >= MIN_USEFUL_TEXT) {
    return { text: truncate(text), usedVision: false };
  }
  try {
    const vision = await withTempFile(buffer, '.pdf', (filePath) =>
      extractTextFromPdfPathWithGptVision(filePath, text),
    );
    return { text: truncate(vision.rawText), usedVision: true };
  } catch {
    return { text: truncate(text), usedVision: false };
  }
}

async function extractFromImage(buffer: Buffer, extension: string): Promise<PreclassifyTextResult> {
  try {
    const vision = await withTempFile(buffer, extension, (filePath) =>
      extractTextFromImageWithGptVision(filePath),
    );
    return { text: truncate(vision.rawText), usedVision: true };
  } catch {
    return { text: '', usedVision: false };
  }
}

async function extractFromZip(buffer: Buffer, fileName: string): Promise<PreclassifyContext> {
  try {
    const zipContext = await inspectZipForPreclassification(buffer, fileName);
    return {
      text: zipContext.textPreview,
      usedVision: false,
      deterministicCategory: zipContext.deterministicCategory,
      categoryConfidence: zipContext.categoryConfidence,
      categoryReason: zipContext.categoryReason,
    };
  } catch {
    return emptyContext();
  }
}

/**
 * Extracts a truncated text preview and optional deterministic category hints
 * from an uploaded document for pre-classification.
 */
export async function extractPreclassifyContext({
  buffer,
  mimeType,
  fileName,
}: {
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly fileName: string;
}): Promise<PreclassifyContext> {
  const format = resolveFileFormat(mimeType, fileName);
  if (format === 'pdf') {
    return { ...emptyContext(), ...(await extractFromPdf(buffer)) };
  }
  if (mimeType.startsWith('image/')) {
    const ext = path.extname(fileName) || '.png';
    return { ...emptyContext(), ...(await extractFromImage(buffer, ext)) };
  }
  if (TEXT_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    return emptyContext(truncate(buffer.toString('utf8')));
  }
  if (format === 'shapefile') {
    return extractFromZip(buffer, fileName);
  }
  return emptyContext();
}

/**
 * Backward-compatible text-only extraction used by legacy callers.
 */
export async function extractPreclassifyText({
  buffer,
  mimeType,
  fileName,
}: {
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly fileName: string;
}): Promise<PreclassifyTextResult> {
  const context = await extractPreclassifyContext({ buffer, mimeType, fileName });
  return { text: context.text, usedVision: context.usedVision };
}
