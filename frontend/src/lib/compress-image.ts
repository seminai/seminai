import imageCompression from 'browser-image-compression';
import {
  generateFallbackFilename,
  isInvalidFilename,
  replaceExtension,
} from './generate-fallback-filename';

const COMPRESSIBLE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;

const COMPRESSION_OPTIONS = {
  maxSizeMB: 2,
  maxWidthOrHeight: 2048,
  initialQuality: 0.8,
  useWebWorker: true,
  fileType: 'image/jpeg' as const,
} as const;

export interface CompressionResult {
  readonly file: File;
  readonly originalSize: number;
  readonly compressedSize: number;
  readonly wasCompressed: boolean;
}

export function isCompressibleImage(file: File): boolean {
  return COMPRESSIBLE_MIME_TYPES.some((mime) => file.type === mime);
}

/** Re-wrap a File whose `name` is missing/generic with a structured fallback. */
function ensureNamedFile(file: File): File {
  if (!isInvalidFilename(file.name)) return file;
  const fallbackName = generateFallbackFilename(file.type || 'application/octet-stream');
  return new File([file], fallbackName, { type: file.type });
}

/**
 * Wrap the compressed Blob/File so that:
 * - it is always a `File` (browser-image-compression with useWebWorker may return a Blob),
 * - it always has a `name` (uses original name with extension swapped to .jpg, or fallback),
 * - it always has the right MIME (image/jpeg, since COMPRESSION_OPTIONS forces it).
 */
function wrapCompressed(compressed: Blob, original: File): File {
  const safeOriginalName = isInvalidFilename(original.name)
    ? generateFallbackFilename('image/jpeg')
    : replaceExtension(original.name, 'jpg');
  return new File([compressed], safeOriginalName, { type: 'image/jpeg' });
}

export async function compressImage(file: File): Promise<CompressionResult> {
  const named = ensureNamedFile(file);
  if (!isCompressibleImage(named)) {
    return { file: named, originalSize: named.size, compressedSize: named.size, wasCompressed: false };
  }
  try {
    const compressed = await imageCompression(named, COMPRESSION_OPTIONS);
    if (compressed.size >= named.size) {
      return { file: named, originalSize: named.size, compressedSize: named.size, wasCompressed: false };
    }
    return {
      file: wrapCompressed(compressed, named),
      originalSize: named.size,
      compressedSize: compressed.size,
      wasCompressed: true,
    };
  } catch {
    return { file: named, originalSize: named.size, compressedSize: named.size, wasCompressed: false };
  }
}

export async function compressImages(files: readonly File[]): Promise<CompressionResult[]> {
  return Promise.all(files.map((f) => compressImage(f)));
}
