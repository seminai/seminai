import { readFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IFileStorage } from '../../domain/services/IFileStorage';
import type { IFileStorageReader } from '../../domain/services/IFileStorageReader';
import type { MulterFile } from './Multer';
import { LocalFileStorage } from './storage/LocalFileStorage';
import { createFileStorage } from './storage/createFileStorage';

const MIME_TYPES: Readonly<Record<string, string>> = Object.freeze({
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.txt': 'text/plain',
});

/** Backwards-compatible facade over the hexagonal file-storage port. */
export class FileService {
  private readonly storage: IFileStorage & IFileStorageReader;

  public constructor(
    private readonly userId?: string,
    storageRoot?: string,
    storage?: IFileStorage & IFileStorageReader,
  ) {
    this.storage =
      storage ?? (storageRoot ? new LocalFileStorage({ root: storageRoot }) : createFileStorage());
  }

  /** Stores a file under a tenant-scoped path and returns its stable internal URL. */
  public async uploadFile(
    file: MulterFile,
    userId: string,
    destinationPath: string,
    type: string,
  ): Promise<string> {
    const result = await this.storage.upload({
      tenantId: userId,
      path: destinationPath,
      name: file.originalname,
      contentType: file.mimetype || type,
      content: new Uint8Array(file.buffer),
    });
    return result.url;
  }

  /** Reads a stable storage URL for an authenticated processor. */
  public async getFileFromUrl(url: string): Promise<MulterFile> {
    if (url.startsWith('file://')) return this.readExplicitLocalFile(url);
    const tenantId = this.userId ?? this.inferTenant(url);
    const stored = await this.storage.read({ tenantId, url });
    const buffer = Buffer.from(stored.content);
    return {
      fieldname: 'file',
      originalname: stored.name,
      encoding: '7bit',
      mimetype: stored.contentType,
      size: buffer.length,
      buffer,
    };
  }

  /** Deletes an object owned by the configured tenant. */
  public async deleteFile(fileUrl: string): Promise<void> {
    if (!this.userId) throw new Error('userId is required');
    await this.storage.delete({ tenantId: this.userId, url: fileUrl });
  }

  /** Returns a temporary read URL for an object owned by the configured tenant. */
  public async getReadUrl(fileUrl: string, expiresInSeconds = 300): Promise<string> {
    if (!this.userId) throw new Error('userId is required');
    return this.storage.getReadUrl({ tenantId: this.userId, url: fileUrl, expiresInSeconds });
  }

  /** Lists objects owned by the configured tenant. */
  public async getUserFiles(directoryPath?: string): Promise<
    Array<{
      readonly name: string;
      readonly url: string;
      readonly metadata: { readonly userId: string; readonly type: string; readonly size: number };
    }>
  > {
    if (!this.userId) throw new Error('userId is required');
    const files = await this.storage.list({ tenantId: this.userId, path: directoryPath });
    return files.map((file) => ({
      name: file.name,
      url: file.url,
      metadata: { userId: this.userId!, type: 'application/octet-stream', size: file.size },
    }));
  }

  private async readExplicitLocalFile(url: string): Promise<MulterFile> {
    const absolutePath = resolve(fileURLToPath(url));
    const buffer = await readFile(absolutePath);
    const name = basename(absolutePath);
    return {
      fieldname: 'file',
      originalname: name,
      encoding: '7bit',
      mimetype: MIME_TYPES[extname(name).toLowerCase()] || 'application/octet-stream',
      size: buffer.length,
      destination: dirname(absolutePath),
      filename: name,
      path: absolutePath,
      buffer,
    };
  }

  private inferTenant(url: string): string {
    const parsed = new URL(url);
    const pathSegments = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const tenantId = parsed.protocol === 'local-storage:' ? pathSegments[0] : pathSegments[0];
    if (!tenantId || !['local-storage:', 's3-storage:'].includes(parsed.protocol)) {
      throw new Error('Tenant context is required for this storage URL');
    }
    return tenantId;
  }
}
