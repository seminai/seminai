import path from 'node:path';
import { pdfToText } from '../ocr/pdfToText';
import { resolveFileFormat } from '../extraction/file-format-resolver';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff']);

export async function countDocumentPages(params: {
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly fileName: string;
}): Promise<number> {
  const format = resolveFileFormat(params.mimeType, params.fileName);
  if (format === 'xml') {
    return 0;
  }
  const extension = path.extname(params.fileName).toLowerCase();
  if (format === 'image' || IMAGE_EXTENSIONS.has(extension)) {
    return 1;
  }
  if (format === 'pdf') {
    const { pageCount } = await pdfToText(params.buffer);
    return Math.max(pageCount, 1);
  }
  return 1;
}
