import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { AppError } from '../../../domain/errors/AppError';
import type { IFileStorage } from '../../../domain/services/IFileStorage';
import type { IFileStorageReader } from '../../../domain/services/IFileStorageReader';
import { StoragePathPolicy } from './StoragePathPolicy';

interface S3FileStorageOptions {
  readonly bucket: string;
  readonly region: string;
  readonly endpoint?: string;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  readonly client?: S3Client;
}

/** Optional S3-compatible storage adapter. */
export class S3FileStorage implements IFileStorage, IFileStorageReader {
  private readonly client: S3Client;
  private readonly paths = new StoragePathPolicy();

  public constructor(private readonly options: S3FileStorageOptions) {
    if (!options.bucket || !options.region) throw AppError.featureNotConfigured('S3 storage');
    const credentials =
      options.accessKeyId && options.secretAccessKey
        ? { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey }
        : undefined;
    this.client =
      options.client ??
      new S3Client({
        region: options.region,
        endpoint: options.endpoint,
        forcePathStyle: Boolean(options.endpoint),
        credentials,
      });
  }

  /** Stores bytes in a tenant-prefixed S3 key. */
  public async upload(input: {
    readonly tenantId: string;
    readonly path: string;
    readonly name: string;
    readonly contentType: string;
    readonly content: Uint8Array;
  }): Promise<{ readonly url: string; readonly key: string }> {
    const tenantId = this.paths.sanitizeSegment(input.tenantId);
    const path = this.paths.sanitizePath(input.path);
    const name = this.paths.sanitizeSegment(input.name);
    const objectKey = [tenantId, path, `${Date.now()}_${randomUUID().slice(0, 8)}_${name}`]
      .filter(Boolean)
      .join('/');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: objectKey,
        Body: input.content,
        ContentType: input.contentType,
      }),
    );
    return { url: this.createUrl(objectKey), key: objectKey.slice(tenantId.length + 1) };
  }

  /** Deletes a tenant-owned S3 object. */
  public async delete(input: { readonly tenantId: string; readonly url: string }): Promise<void> {
    const key = this.parseUrl(input.url, input.tenantId);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }));
  }

  /** Creates a native expiring S3 read URL. */
  public async getReadUrl(input: {
    readonly tenantId: string;
    readonly url: string;
    readonly expiresInSeconds?: number;
  }): Promise<string> {
    const key = this.parseUrl(input.url, input.tenantId);
    const expiresIn = Math.min(Math.max(input.expiresInSeconds ?? 300, 1), 3600);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
      { expiresIn },
    );
  }

  /** Checks whether a tenant-owned S3 object exists. */
  public async exists(input: { readonly tenantId: string; readonly url: string }): Promise<boolean> {
    const key = this.parseUrl(input.url, input.tenantId);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }));
      return true;
    } catch (error) {
      const metadata = (error as { readonly $metadata?: { readonly httpStatusCode?: number } }).$metadata;
      if (metadata?.httpStatusCode === 404) return false;
      throw error;
    }
  }

  /** Lists objects below a tenant-owned S3 prefix. */
  public async list(input: {
    readonly tenantId: string;
    readonly path?: string;
  }): Promise<readonly { readonly name: string; readonly url: string; readonly size: number }[]> {
    const tenantId = this.paths.sanitizeSegment(input.tenantId);
    const path = input.path ? this.paths.sanitizePath(input.path) : '';
    const prefix = [tenantId, path].filter(Boolean).join('/') + '/';
    const output = await this.client.send(
      new ListObjectsV2Command({ Bucket: this.options.bucket, Prefix: prefix }),
    );
    return (output.Contents ?? []).flatMap((item) => {
      if (!item.Key) return [];
      return [{ name: basename(item.Key), url: this.createUrl(item.Key), size: item.Size ?? 0 }];
    });
  }

  /** Reads a tenant-owned S3 object for background processors. */
  public async read(input: {
    readonly tenantId: string;
    readonly url: string;
  }): Promise<{ readonly content: Uint8Array; readonly name: string; readonly contentType: string }> {
    const key = this.parseUrl(input.url, input.tenantId);
    const output = await this.client.send(
      new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
    );
    if (!output.Body) throw AppError.notFound('Stored file is empty', 'FILE_NOT_FOUND');
    return {
      content: await output.Body.transformToByteArray(),
      name: basename(key),
      contentType: output.ContentType || 'application/octet-stream',
    };
  }

  private createUrl(key: string): string {
    const path = key.split('/').map(encodeURIComponent).join('/');
    return `s3-storage://${encodeURIComponent(this.options.bucket)}/${path}`;
  }

  private parseUrl(value: string, expectedTenant: string): string {
    const parsed = new URL(value);
    if (parsed.protocol !== 's3-storage:' || decodeURIComponent(parsed.hostname) !== this.options.bucket) {
      throw new Error('Unsupported file URL');
    }
    const key = this.paths.sanitizePath(
      parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent).join('/'),
    );
    const [tenantId] = key.split('/');
    if (tenantId !== this.paths.sanitizeSegment(expectedTenant)) {
      throw new Error('File does not belong to the configured tenant');
    }
    return key;
  }
}
