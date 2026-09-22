import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve, sep } from 'node:path';
import { AppError } from '../../../domain/errors/AppError';
import type { IFileStorage } from '../../../domain/services/IFileStorage';
import type { IFileStorageReader } from '../../../domain/services/IFileStorageReader';
import { StoragePathPolicy } from './StoragePathPolicy';

interface LocalFileStorageOptions {
  readonly root?: string;
  readonly publicBaseUrl?: string;
  readonly signingSecret?: string;
  readonly now?: () => number;
}

interface LocalLocation {
  readonly tenantId: string;
  readonly key: string;
  readonly absolutePath: string;
}

const MIME_TYPES: Readonly<Record<string, string>> = Object.freeze({
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.txt': 'text/plain',
});

/** Tenant-scoped filesystem storage with HMAC-signed read URLs. */
export class LocalFileStorage implements IFileStorage, IFileStorageReader {
  private readonly root: string;
  private readonly publicBaseUrl: string;
  private readonly now: () => number;
  private readonly paths = new StoragePathPolicy();

  public constructor(private readonly options: LocalFileStorageOptions = {}) {
    const dataRoot = process.env.DATA_DIR || resolve(process.cwd(), 'data');
    this.root = resolve(options.root || resolve(dataRoot, 'storage'));
    this.publicBaseUrl = (options.publicBaseUrl ?? process.env.PUBLIC_APP_URL ?? '').replace(
      /\/$/,
      '',
    );
    this.now = options.now ?? Date.now;
  }

  /** Stores bytes below DATA_DIR/storage/<tenant>. */
  public async upload(input: {
    readonly tenantId: string;
    readonly path: string;
    readonly name: string;
    readonly contentType: string;
    readonly content: Uint8Array;
  }): Promise<{ readonly url: string; readonly key: string }> {
    const tenantId = this.paths.sanitizeSegment(input.tenantId);
    const directory = this.paths.sanitizePath(input.path);
    const name = this.paths.sanitizeSegment(input.name);
    const key = [directory, `${this.now()}_${randomUUID().slice(0, 8)}_${name}`]
      .filter(Boolean)
      .join('/');
    const absolutePath = this.paths.resolveInside(resolve(this.root, tenantId), key);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.content, { flag: 'wx' });
    return { url: this.createUrl(tenantId, key), key };
  }

  /** Deletes a tenant-owned local object. */
  public async delete(input: { readonly tenantId: string; readonly url: string }): Promise<void> {
    const location = this.parseUrl(input.url, input.tenantId);
    await rm(location.absolutePath, { force: true });
  }

  /** Creates an expiring HMAC-signed local download URL. */
  public async getReadUrl(input: {
    readonly tenantId: string;
    readonly url: string;
    readonly expiresInSeconds?: number;
  }): Promise<string> {
    const location = this.parseUrl(input.url, input.tenantId);
    const lifetime = Math.min(Math.max(input.expiresInSeconds ?? 300, 1), 3600);
    const expires = Math.floor(this.now() / 1000) + lifetime;
    const signature = this.sign(location.tenantId, location.key, expires);
    const query = new URLSearchParams({
      tenant: location.tenantId,
      key: location.key,
      expires: String(expires),
      signature,
    });
    return `${this.publicBaseUrl}/files/content?${query.toString()}`;
  }

  /** Checks whether a tenant-owned local object exists. */
  public async exists(input: { readonly tenantId: string; readonly url: string }): Promise<boolean> {
    const location = this.parseUrl(input.url, input.tenantId);
    try {
      return (await stat(location.absolutePath)).isFile();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  /** Lists tenant-owned local objects without exposing filesystem paths. */
  public async list(input: {
    readonly tenantId: string;
    readonly path?: string;
  }): Promise<readonly { readonly name: string; readonly url: string; readonly size: number }[]> {
    const tenantId = this.paths.sanitizeSegment(input.tenantId);
    const prefix = input.path ? this.paths.sanitizePath(input.path) : '';
    const tenantRoot = resolve(this.root, tenantId);
    const directory = this.paths.resolveInside(tenantRoot, prefix);
    const paths = await this.walk(directory);
    return Promise.all(
      paths.map(async (absolutePath) => {
        const key = absolutePath.slice(tenantRoot.length + 1).split(sep).join('/');
        const details = await stat(absolutePath);
        return { name: basename(absolutePath), url: this.createUrl(tenantId, key), size: details.size };
      }),
    );
  }

  /** Reads a tenant-owned object for local processors. */
  public async read(input: {
    readonly tenantId: string;
    readonly url: string;
  }): Promise<{ readonly content: Uint8Array; readonly name: string; readonly contentType: string }> {
    const location = this.parseUrl(input.url, input.tenantId);
    const content = await readFile(location.absolutePath);
    return {
      content: new Uint8Array(content),
      name: basename(location.absolutePath),
      contentType: MIME_TYPES[extname(location.absolutePath).toLowerCase()] || 'application/octet-stream',
    };
  }

  /** Validates a signed request and reads its local object. */
  public async readSigned(input: {
    readonly tenantId: string;
    readonly key: string;
    readonly expires: number;
    readonly signature: string;
  }): Promise<{ readonly content: Uint8Array; readonly name: string; readonly contentType: string }> {
    if (!Number.isSafeInteger(input.expires) || input.expires < Math.floor(this.now() / 1000)) {
      throw AppError.forbidden('Signed file URL has expired', 'SIGNED_URL_EXPIRED');
    }
    const expected = this.sign(input.tenantId, input.key, input.expires);
    if (!this.matchesSignature(input.signature, expected)) {
      throw AppError.forbidden('Invalid signed file URL', 'INVALID_SIGNED_URL');
    }
    return this.read({ tenantId: input.tenantId, url: this.createUrl(input.tenantId, input.key) });
  }

  private createUrl(tenantId: string, key: string): string {
    const path = key.split('/').map(encodeURIComponent).join('/');
    return `local-storage:///${encodeURIComponent(tenantId)}/${path}`;
  }

  private parseUrl(value: string, expectedTenant: string): LocalLocation {
    const parsed = new URL(value);
    if (parsed.protocol !== 'local-storage:') throw new Error('Unsupported file URL');
    const [tenantValue, ...pathValues] = parsed.pathname.split('/').filter(Boolean);
    const tenantId = this.paths.sanitizeSegment(decodeURIComponent(tenantValue || ''));
    if (tenantId !== this.paths.sanitizeSegment(expectedTenant)) {
      throw new Error('File does not belong to the configured tenant');
    }
    const key = this.paths.sanitizePath(pathValues.map(decodeURIComponent).join('/'));
    const absolutePath = this.paths.resolveInside(resolve(this.root, tenantId), key);
    return { tenantId, key, absolutePath };
  }

  private sign(tenantId: string, key: string, expires: number): string {
    const secret =
      this.options.signingSecret || process.env.FILE_URL_SIGNING_SECRET || process.env.JWT_SECRET;
    if (!secret) throw AppError.featureNotConfigured('Signed file downloads');
    return createHmac('sha256', secret).update(`${tenantId}\n${key}\n${expires}`).digest('hex');
  }

  private matchesSignature(actual: string, expected: string): boolean {
    const actualBuffer = new TextEncoder().encode(actual);
    const expectedBuffer = new TextEncoder().encode(expected);
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  }

  private async walk(directory: string): Promise<string[]> {
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      const nested = await Promise.all(
        entries.map(async (entry) => {
          const entryPath = resolve(directory, entry.name);
          return entry.isDirectory() ? this.walk(entryPath) : [entryPath];
        }),
      );
      return nested.flat();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
}
