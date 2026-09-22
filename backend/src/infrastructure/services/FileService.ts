import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MulterFile } from './Multer';

export interface FileInfo {
  readonly url: string;
  readonly name: string;
  readonly type: string;
  readonly path?: string;
}

interface LocalStorageLocation {
  readonly tenantId: string;
  readonly relativePath: string;
  readonly absolutePath: string;
}

const MIME_TYPES: Readonly<Record<string, string>> = Object.freeze({
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.txt': 'text/plain',
});

function sanitizeSegment(value: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    throw new Error('Invalid storage path segment');
  }
  return sanitized;
}

function sanitizeRelativePath(value: string): string {
  return value
    .split(/[\\/]+/)
    .filter(Boolean)
    .map(sanitizeSegment)
    .join('/');
}

function createStorageUrl(tenantId: string, relativePath: string): string {
  const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/');
  return `local-storage:///${encodeURIComponent(tenantId)}/${encodedPath}`;
}

function assertInsideRoot(root: string, candidate: string): void {
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    throw new Error('Storage path escapes the configured data directory');
  }
}

/** Backwards-compatible local-only file facade. */
export class FileService {
  private readonly storageRoot: string;

  constructor(
    private readonly userId?: string,
    storageRoot = resolve(process.env.DATA_DIR || resolve(process.cwd(), 'data'), 'storage'),
  ) {
    this.storageRoot = resolve(storageRoot);
  }

  /** Stores a file under a tenant-scoped directory and returns an internal storage URL. */
  public async uploadFile(
    file: MulterFile,
    userId: string,
    destinationPath: string,
    _type: string,
  ): Promise<string> {
    const tenantId = sanitizeSegment(userId);
    const directory = sanitizeRelativePath(destinationPath);
    const cleanName = sanitizeSegment(file.originalname);
    const fileName = `${Date.now()}_${randomUUID().slice(0, 8)}_${cleanName}`;
    const relativePath = [directory, fileName].filter(Boolean).join('/');
    const absolutePath = resolve(this.storageRoot, tenantId, relativePath);
    assertInsideRoot(resolve(this.storageRoot, tenantId), absolutePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, new Uint8Array(file.buffer), { flag: 'wx' });
    return createStorageUrl(tenantId, relativePath);
  }

  /** Loads an internal local-storage URL or an explicit local file URL. */
  public async getFileFromUrl(url: string): Promise<MulterFile> {
    const location = this.resolveUrl(url);
    const buffer = await readFile(location.absolutePath);
    const fileName = basename(location.absolutePath);
    return {
      fieldname: 'file',
      originalname: fileName,
      encoding: '7bit',
      mimetype: MIME_TYPES[extname(fileName).toLowerCase()] || 'application/octet-stream',
      size: buffer.length,
      destination: dirname(location.absolutePath),
      filename: fileName,
      path: location.absolutePath,
      buffer,
    };
  }

  /** Deletes a local object when it belongs to the configured tenant. */
  public async deleteFile(fileUrl: string): Promise<void> {
    const location = this.resolveUrl(fileUrl);
    await rm(location.absolutePath, { force: true });
  }

  /** Lists local files for the configured tenant without exposing filesystem paths. */
  public async getUserFiles(directoryPath?: string): Promise<
    Array<{
      readonly name: string;
      readonly url: string;
      readonly metadata: { readonly userId: string; readonly type: string };
    }>
  > {
    if (!this.userId) throw new Error('userId is required');
    const tenantId = sanitizeSegment(this.userId);
    const prefix = directoryPath ? sanitizeRelativePath(directoryPath) : '';
    const directory = resolve(this.storageRoot, tenantId, prefix);
    assertInsideRoot(resolve(this.storageRoot, tenantId), directory);
    const paths = await this.walk(directory);
    return paths.map((absolutePath) => {
      const relativePath = absolutePath.slice(resolve(this.storageRoot, tenantId).length + 1);
      return {
        name: basename(absolutePath),
        url: createStorageUrl(tenantId, relativePath.split(sep).join('/')),
        metadata: { userId: tenantId, type: 'application/octet-stream' },
      };
    });
  }

  private resolveUrl(value: string): LocalStorageLocation {
    if (!value) throw new Error('File URL is required');
    if (value.startsWith('file://')) return this.resolveExplicitFileUrl(value);
    const parsed = new URL(value);
    if (parsed.protocol !== 'local-storage:') throw new Error('Unsupported file URL');
    const [tenantValue, ...pathValues] = parsed.pathname.split('/').filter(Boolean);
    const tenantId = sanitizeSegment(decodeURIComponent(tenantValue || ''));
    if (this.userId && sanitizeSegment(this.userId) !== tenantId) {
      throw new Error('File does not belong to the configured tenant');
    }
    const relativePath = sanitizeRelativePath(pathValues.map(decodeURIComponent).join('/'));
    const tenantRoot = resolve(this.storageRoot, tenantId);
    const absolutePath = resolve(tenantRoot, relativePath);
    assertInsideRoot(tenantRoot, absolutePath);
    return { tenantId, relativePath, absolutePath };
  }

  private resolveExplicitFileUrl(value: string): LocalStorageLocation {
    const absolutePath = resolve(fileURLToPath(value));
    return { tenantId: 'explicit-local-file', relativePath: basename(absolutePath), absolutePath };
  }

  private async walk(directory: string): Promise<string[]> {
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      const nested = await Promise.all(
        entries.map(async (entry) => {
          const entryPath = resolve(directory, entry.name);
          if (entry.isDirectory()) return this.walk(entryPath);
          const details = await stat(entryPath);
          return details.isFile() ? [entryPath] : [];
        }),
      );
      return nested.flat();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
}
