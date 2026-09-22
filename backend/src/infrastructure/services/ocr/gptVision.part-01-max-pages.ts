import axios from 'axios';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { execSync, spawn } from 'child_process';

/**
 * Upper bound on PDF pages processed by GPT Vision. Previously hard-coded to 10,
 * which silently truncated long invoices / DDTs. Now configurable via env var
 * `GPT_VISION_MAX_PAGES` with a generous default (40) so full multi-page documents
 * reach the LLM unless the user explicitly lowers it for cost reasons.
 */
export const MAX_PAGES = Number.parseInt(process.env['GPT_VISION_MAX_PAGES'] ?? '40', 10);

export const IMAGE_DPI = 200;

// High resolution for better OCR

export interface GptVisionExtractionResult {
  readonly rawText: string;
  readonly pagesProcessed: number;
  readonly model: string;
}

export interface PageImage {
  readonly pageNumber: number;
  readonly base64: string;
  readonly mimeType: string;
}

/**
 * Downloads a PDF from URL to a temporary file
 */
export async function downloadPdfToTempFile(pdfUrl: string): Promise<string> {
  const response = await axios.get<ArrayBuffer>(pdfUrl, {
    responseType: 'arraybuffer',
    timeout: 60000,
    headers: { Accept: 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.8' },
  });
  if (response.status < 200 || response.status >= 300 || !response.data) {
    throw new Error(`Failed to download PDF: status ${response.status}`);
  }
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `gpt-vision-${Date.now()}.pdf`);
  const buffer = Buffer.from(response.data);
  fs.writeFileSync(tmpFile, new Uint8Array(buffer));
  return tmpFile;
}

/**
 * Check if pdftoppm (poppler-utils) is available on the system
 */
export function isPdftoppmAvailable(): boolean {
  try {
    execSync('which pdftoppm', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert PDF pages to PNG images using pdftoppm (poppler-utils)
 * Returns array of base64 encoded images, max 10 pages
 */
export async function convertPdfToImagesWithPdftoppm(pdfPath: string): Promise<PageImage[]> {
  const tmpDir = os.tmpdir();
  const outputPrefix = path.join(tmpDir, `gpt-vision-page-${Date.now()}`);

  return new Promise((resolve, reject) => {
    const args = [
      '-png',
      '-r',
      String(IMAGE_DPI),
      '-l',
      String(MAX_PAGES), // last page to convert
      pdfPath,
      outputPrefix,
    ];

    const process = spawn('pdftoppm', args);
    let stderr = '';

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`pdftoppm failed with code ${code}: ${stderr}`));
        return;
      }

      try {
        const images: PageImage[] = [];
        const files = fs
          .readdirSync(tmpDir)
          .filter(
            (f) =>
              f.startsWith(`gpt-vision-page-${path.basename(outputPrefix).split('-').pop()}`) &&
              f.endsWith('.png'),
          )
          .sort();

        for (let i = 0; i < Math.min(files.length, MAX_PAGES); i++) {
          const filePath = path.join(tmpDir, files[i]);
          const buffer = fs.readFileSync(filePath);
          images.push({
            pageNumber: i + 1,
            base64: buffer.toString('base64'),
            mimeType: 'image/png',
          });
          fs.unlinkSync(filePath); // Cleanup
        }

        resolve(images);
      } catch (err) {
        reject(err);
      }
    });

    process.on('error', reject);
  });
}

/**
 * Alternative: Convert PDF to images using ImageMagick convert (if available)
 */
export async function convertPdfToImagesWithImageMagick(pdfPath: string): Promise<PageImage[]> {
  const tmpDir = os.tmpdir();
  const outputPattern = path.join(tmpDir, `gpt-vision-im-${Date.now()}-%03d.png`);

  return new Promise((resolve, reject) => {
    const args = [
      '-density',
      String(IMAGE_DPI),
      '-quality',
      '95',
      `${pdfPath}[0-${MAX_PAGES - 1}]`, // First 10 pages (0-indexed)
      outputPattern,
    ];

    const process = spawn('convert', args);
    let stderr = '';

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`ImageMagick convert failed with code ${code}: ${stderr}`));
        return;
      }

      try {
        const images: PageImage[] = [];
        const baseName = `gpt-vision-im-${path.basename(outputPattern).split('-')[2].split('%')[0]}`;
        const files = fs
          .readdirSync(tmpDir)
          .filter((f) => f.includes(baseName) && f.endsWith('.png'))
          .sort();

        for (let i = 0; i < Math.min(files.length, MAX_PAGES); i++) {
          const filePath = path.join(tmpDir, files[i]);
          const buffer = fs.readFileSync(filePath);
          images.push({
            pageNumber: i + 1,
            base64: buffer.toString('base64'),
            mimeType: 'image/png',
          });
          fs.unlinkSync(filePath);
        }

        resolve(images);
      } catch (err) {
        reject(err);
      }
    });

    process.on('error', reject);
  });
}

/**
 * Check if ImageMagick convert is available
 */
export function isImageMagickAvailable(): boolean {
  try {
    execSync('which convert', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
