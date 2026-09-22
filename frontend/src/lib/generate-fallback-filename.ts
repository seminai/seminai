const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'text/csv': 'csv',
  'application/zip': 'zip',
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function randomLetters(count: number): string {
  let result = '';
  for (let i = 0; i < count; i++) {
    result += String.fromCharCode(97 + Math.floor(Math.random() * 26));
  }
  return result;
}

function randomDigits(count: number): string {
  return String(Math.floor(Math.random() * 10 ** count)).padStart(count, '0');
}

function extensionForMime(mimeType: string): string {
  return EXT_BY_MIME[mimeType.toLowerCase()] ?? 'bin';
}

/**
 * Returns true when the file name looks generic or is missing entirely.
 * Triggers naming fallback for cases like:
 * - Drag-drop from external apps (browser uses literal "blob" as default)
 * - Blob output of `browser-image-compression` with useWebWorker that loses the original name
 * - Files missing an extension or with an empty name
 */
export function isInvalidFilename(name: string | undefined | null): boolean {
  if (!name) return true;
  const trimmed = name.trim().toLowerCase();
  if (trimmed === '' || trimmed === 'blob' || trimmed === 'unknown') return true;
  return !trimmed.includes('.');
}

/**
 * Generates a structured fallback filename:
 *   DD-MM-YYYY-HH-MM-SS-<3 random letters>-<5 random digits>.<ext>
 * Extension is inferred from `mimeType`; falls back to `bin` for unknown types.
 */
export function generateFallbackFilename(mimeType: string): string {
  const now = new Date();
  const stamp =
    `${pad2(now.getDate())}-${pad2(now.getMonth() + 1)}-${now.getFullYear()}` +
    `-${pad2(now.getHours())}-${pad2(now.getMinutes())}-${pad2(now.getSeconds())}`;
  return `${stamp}-${randomLetters(3)}-${randomDigits(5)}.${extensionForMime(mimeType)}`;
}

/**
 * Replaces the extension in `name` with `newExt` (no leading dot).
 * Used when a compressed image is re-encoded to JPEG and the original
 * name had a different extension (e.g. `photo.png` → `photo.jpg`).
 */
export function replaceExtension(name: string, newExt: string): string {
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex === -1) return `${name}.${newExt}`;
  return `${name.slice(0, dotIndex)}.${newExt}`;
}
