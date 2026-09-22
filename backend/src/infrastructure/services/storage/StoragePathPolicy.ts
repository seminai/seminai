import { resolve, sep } from 'node:path';

/** Sanitizes storage keys and enforces filesystem containment. */
export class StoragePathPolicy {
  /** Returns a safe single path segment. */
  public sanitizeSegment(value: string): string {
    const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!sanitized || sanitized === '.' || sanitized === '..') {
      throw new Error('Invalid storage path segment');
    }
    return sanitized;
  }

  /** Returns a slash-normalized relative object key. */
  public sanitizePath(value: string): string {
    return value
      .split(/[\\/]+/)
      .filter(Boolean)
      .map((segment) => this.sanitizeSegment(segment))
      .join('/');
  }

  /** Resolves a candidate and rejects paths outside the requested root. */
  public resolveInside(root: string, relativePath: string): string {
    const normalizedRoot = resolve(root);
    const candidate = resolve(normalizedRoot, relativePath);
    if (candidate !== normalizedRoot && !candidate.startsWith(`${normalizedRoot}${sep}`)) {
      throw new Error('Storage path escapes the configured data directory');
    }
    return candidate;
  }
}
