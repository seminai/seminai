import { FileService } from '../../FileService';
import { pdfToText } from '../../ocr/pdfToText';
import { extractTextFromImageWithGptVision } from '../../ocr/gptVision';
import fs from 'fs';
import os from 'os';
import path from 'path';

const MAX_EXTRACT_CHARS = 2000;
const PDF_EXTRACT_TIMEOUT_MS = 15000;
const IMAGE_EXTRACT_TIMEOUT_MS = 45000;
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

interface FileExtractionResult {
  readonly text: string | null;
  readonly metadata: {
    readonly name: string;
    readonly type: string | null;
    readonly truncated: boolean;
    readonly extractionStatus: 'not_requested' | 'success' | 'failed';
  };
}

/**
 * Extracts text content from mentioned files for context injection.
 * Supports PDF extraction via pdfToText; other types return metadata only.
 */
export async function extractFileContent(params: {
  readonly fileUrl: string;
  readonly fileName: string;
  readonly fileType: string | null;
}): Promise<FileExtractionResult> {
  const { fileUrl, fileName, fileType } = params;
  const isPdf = fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
  const isImage =
    IMAGE_MIME_TYPES.has(fileType ?? '') || /\.(jpg|jpeg|png)$/i.test(fileName.toLowerCase());

  if (!isPdf && !isImage) {
    return {
      text: null,
      metadata: {
        name: fileName,
        type: fileType,
        truncated: false,
        extractionStatus: 'not_requested',
      },
    };
  }

  try {
    const fileService = new FileService();
    const downloadTimeoutMs = isImage ? IMAGE_EXTRACT_TIMEOUT_MS : PDF_EXTRACT_TIMEOUT_MS;
    const multerFile = await Promise.race([
      fileService.getFileFromUrl(fileUrl),
      createTimeout(downloadTimeoutMs),
    ]);

    const rawText = isPdf
      ? await extractTextFromPdf(multerFile.buffer)
      : await extractTextFromImage(multerFile.buffer, fileName);
    const isTruncated = rawText.length > MAX_EXTRACT_CHARS;
    const text = isTruncated ? rawText.slice(0, MAX_EXTRACT_CHARS) + '…' : rawText;

    return {
      text: text || null,
      metadata: {
        name: fileName,
        type: fileType,
        truncated: isTruncated,
        extractionStatus: rawText.length > 0 ? 'success' : 'failed',
      },
    };
  } catch (error) {
    console.warn(`[MentionFileExtractor] Failed to extract "${fileName}":`, error);
    return {
      text: null,
      metadata: { name: fileName, type: fileType, truncated: false, extractionStatus: 'failed' },
    };
  }
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const parsed = await Promise.race([pdfToText(buffer), createTimeout(PDF_EXTRACT_TIMEOUT_MS)]);
  return parsed.text?.trim() ?? '';
}

async function extractTextFromImage(buffer: Buffer, fileName: string): Promise<string> {
  const tempPath = path.join(os.tmpdir(), `mention-${Date.now()}-${sanitizeFileName(fileName)}`);
  try {
    fs.writeFileSync(tempPath, new Uint8Array(buffer));
    const visionResult = await Promise.race([
      extractTextFromImageWithGptVision(tempPath, 'DDT e fatture agrarie italiane'),
      createTimeout(IMAGE_EXTRACT_TIMEOUT_MS),
    ]);
    return visionResult.rawText?.trim() ?? '';
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function createTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`File extraction timed out after ${ms}ms`)), ms),
  );
}
