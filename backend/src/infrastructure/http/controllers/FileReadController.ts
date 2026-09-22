import type { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import type { ResourceAccessGuard } from '../../../application/use-cases/access/ResourceAccessGuard';
import type { IFileStorage } from '../../../domain/services/IFileStorage';
import { createFileStorage } from '../../services/storage/createFileStorage';
import { LocalFileStorage } from '../../services/storage/LocalFileStorage';

/** Issues signed URLs and serves validated local storage downloads. */
export class FileReadController {
  public constructor(
    private readonly accessGuard: ResourceAccessGuard,
    private readonly storage: IFileStorage = createFileStorage(),
    private readonly localStorage: LocalFileStorage = new LocalFileStorage(),
  ) {}

  /** Creates a short-lived read URL after checking resource ownership. */
  public async createReadUrl(request: Request, response: Response): Promise<Response> {
    const userId = request.user?.id;
    const fileId = request.params.id;
    if (!userId) throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    if (!fileId) throw AppError.badRequest('Missing file ID', 'MISSING_FILE_ID');
    const file = await this.accessGuard.assertFile(userId, fileId);
    const requestedLifetime = Number(request.query.expiresInSeconds ?? 300);
    if (!Number.isFinite(requestedLifetime)) {
      throw AppError.badRequest('Invalid read URL lifetime', 'INVALID_URL_LIFETIME');
    }
    const url = await this.storage.getReadUrl({
      tenantId: userId,
      url: file.url,
      expiresInSeconds: requestedLifetime,
    });
    return response.json({ status: 'success', data: { url } });
  }

  /** Streams a local object only when its HMAC signature and expiry are valid. */
  public async downloadSigned(request: Request, response: Response): Promise<Response> {
    if ((process.env.STORAGE_DRIVER || 'local') !== 'local') {
      throw AppError.notFound('Local file endpoint is disabled', 'FILE_ENDPOINT_DISABLED');
    }
    const tenantId = this.requireQuery(request, 'tenant');
    const key = this.requireQuery(request, 'key');
    const signature = this.requireQuery(request, 'signature');
    const expires = Number(this.requireQuery(request, 'expires'));
    const file = await this.localStorage.readSigned({ tenantId, key, signature, expires });
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Disposition', `inline; filename="${this.safeName(file.name)}"`);
    response.setHeader('Cache-Control', 'private, no-store');
    return response.send(Buffer.from(file.content));
  }

  private requireQuery(request: Request, name: string): string {
    const value = request.query[name];
    if (typeof value !== 'string' || !value) {
      throw AppError.badRequest(`Missing ${name}`, 'INVALID_SIGNED_URL');
    }
    return value;
  }

  private safeName(value: string): string {
    return value.replace(/["\r\n]/g, '_');
  }
}
