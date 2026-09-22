/* eslint-disable no-process-env */
import axios, { AxiosError } from 'axios';
import fs from 'fs';
import path from 'path';

const MISTRAL_API_KEY: string = process.env['MISTRAL_API_KEY'] ?? '';
const MISTRAL_OCR_API_URL: string = 'https://api.mistral.ai/v1/ocr';
const MISTRAL_OCR_MODEL: string = process.env['MISTRAL_OCR_MODEL'] ?? 'mistral-ocr-latest';

const PDF_MAGIC = '%PDF-';

/**
 * Thrown when the remote file served at a PDF URL is not actually a PDF.
 * Callers typically catch this to skip OCR gracefully without exploding.
 */
export class InvalidPdfError extends Error {
  public readonly url: string;
  public readonly firstBytes: string;

  constructor(url: string, firstBytes: string) {
    super(
      `Resource at ${url} is not a valid PDF (first bytes: "${firstBytes.replace(/[^\x20-\x7e]/g, '.')}")`,
    );
    this.name = 'InvalidPdfError';
    this.url = url;
    this.firstBytes = firstBytes;
  }
}

function ensureMistral(): void {
  if (!MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY is not set');
  }
}

/**
 * Fetch the first bytes of a URL to verify that it actually serves a PDF.
 * Uses an HTTP Range request to avoid downloading the whole file. Falls back
 * to a small regular GET if the server does not honour the Range header.
 */
export async function isValidPdfUrl(url: string): Promise<boolean> {
  try {
    const headResponse = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      headers: { Range: `bytes=0-${PDF_MAGIC.length - 1}` },
      timeout: 15000,
      validateStatus: (status) => (status >= 200 && status < 300) || status === 206,
    });
    const buffer = Buffer.from(headResponse.data);
    const head = buffer.slice(0, PDF_MAGIC.length).toString('latin1');
    return head === PDF_MAGIC;
  } catch (error) {
    console.warn(
      `[MISTRAL-OCR] isValidPdfUrl check failed for ${url}:`,
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

function isMistralInvalidPdfResponse(error: AxiosError): boolean {
  if (error.response?.status !== 400) return false;
  const payload = error.response.data as { type?: string; message?: string } | undefined;
  if (!payload) return false;
  if (payload.type && /document_parser_invalid_file/i.test(payload.type)) return true;
  if (payload.message && /not a valid pdf/i.test(payload.message)) return true;
  return false;
}

function mimeTypeForImage(imagePath: string): string {
  const ext = path.extname(imagePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  return 'image/jpeg';
}

/**
 * Use Mistral's Document AI OCR endpoint to extract Markdown from a local image file.
 * Reads the image as base64 and sends it via the image_url document type.
 */
export async function extractMarkdownWithMistralOCRFromImagePath(
  imagePath: string,
): Promise<string> {
  ensureMistral();
  if (!imagePath || !fs.existsSync(imagePath))
    throw new Error(`Image file not found: ${imagePath}`);
  const mime = mimeTypeForImage(imagePath);
  const base64 = fs.readFileSync(imagePath).toString('base64');
  const payload = {
    model: MISTRAL_OCR_MODEL,
    document: {
      type: 'image_url',
      image_url: `data:${mime};base64,${base64}`,
    },
    include_image_base64: false,
  } as const;
  const res = await axios.post(MISTRAL_OCR_API_URL, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    timeout: 120000,
  });
  const pages: ReadonlyArray<{ markdown?: string }> = Array.isArray(res.data?.pages)
    ? (res.data.pages as ReadonlyArray<{ markdown?: string }>)
    : [];
  if (pages.length === 0) {
    const markdown: string | undefined = res.data?.markdown;
    return typeof markdown === 'string' ? markdown.trim() : '';
  }
  return pages
    .map((p) => (p.markdown || '').trim())
    .filter((s) => s.length > 0)
    .join('\n\n');
}

function parseMistralOcrPages(data: unknown): string {
  const pages: ReadonlyArray<{ markdown?: string }> = Array.isArray(
    (data as { pages?: unknown }).pages,
  )
    ? (data as { pages: ReadonlyArray<{ markdown?: string }> }).pages
    : [];
  if (pages.length > 0) {
    return pages
      .map((p) => (p.markdown || '').trim())
      .filter((s) => s.length > 0)
      .join('\n\n');
  }
  const markdown: string | undefined = (data as { markdown?: string }).markdown;
  return typeof markdown === 'string' ? markdown.trim() : '';
}

/**
 * Use Mistral's Document AI OCR endpoint to extract Markdown from a local PDF file path.
 * Reads the file as base64 and sends it via a data URI (avoids file:// URL limitation).
 */
export async function extractMarkdownWithMistralOCRFromFilePath(filePath: string): Promise<string> {
  ensureMistral();
  if (!filePath || !fs.existsSync(filePath)) throw new Error(`PDF file not found: ${filePath}`);
  const rawBuffer = fs.readFileSync(filePath);
  const head = rawBuffer.slice(0, PDF_MAGIC.length).toString('latin1');
  if (head !== PDF_MAGIC) {
    throw new InvalidPdfError(filePath, head);
  }
  const base64 = rawBuffer.toString('base64');
  const payload = {
    model: MISTRAL_OCR_MODEL,
    document: {
      type: 'document_url',
      document_url: `data:application/pdf;base64,${base64}`,
    },
    include_image_base64: false,
  };
  try {
    const res = await axios.post(MISTRAL_OCR_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
      },
      timeout: 300000,
    });
    return parseMistralOcrPages(res.data);
  } catch (error) {
    if (axios.isAxiosError(error) && isMistralInvalidPdfResponse(error)) {
      throw new InvalidPdfError(filePath, head);
    }
    throw error;
  }
}

/**
 * Use Mistral's Document AI OCR endpoint to extract Markdown from a PDF URL.
 * Concatenates page-level markdown into a single string.
 */
export async function extractMarkdownWithMistralOCRFromUrl(pdfUrl: string): Promise<string> {
  ensureMistral();
  if (!pdfUrl || pdfUrl.trim().length === 0) throw new Error('pdfUrl is required');
  const valid = await isValidPdfUrl(pdfUrl);
  if (!valid) {
    throw new InvalidPdfError(pdfUrl, '');
  }
  const payload = {
    model: MISTRAL_OCR_MODEL,
    document: {
      type: 'document_url',
      document_url: pdfUrl,
    },
    include_image_base64: false,
  } as const;
  try {
    const res = await axios.post(MISTRAL_OCR_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
      },
      timeout: 180000,
    });
    return parseMistralOcrPages(res.data);
  } catch (error) {
    if (axios.isAxiosError(error) && isMistralInvalidPdfResponse(error)) {
      throw new InvalidPdfError(pdfUrl, '');
    }
    throw error;
  }
}
