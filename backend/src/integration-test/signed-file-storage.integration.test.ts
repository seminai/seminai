import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { prisma } from './setup';
import { createTestCompany, createTestUser, type ITestUser } from './helpers';
import { FileService } from '../infrastructure/services/FileService';
import type { MulterFile } from '../infrastructure/services/Multer';
import { LocalFileStorage } from '../infrastructure/services/storage/LocalFileStorage';
import { FileReadController } from '../infrastructure/http/controllers/FileReadController';
import { createResourceAccessGuard } from '../infrastructure/http/access/create-resource-access-guard';
import { buildPublicRuntimeConfig } from '../infrastructure/runtime/publicRuntimeConfig';
import { AppError } from '../domain/errors/AppError';

function createSyntheticFile(): MulterFile {
  const buffer = Buffer.from('queue-readable-bytes', 'utf8');
  return {
    fieldname: 'file',
    originalname: 'queue.txt',
    encoding: '7bit',
    mimetype: 'text/plain',
    size: buffer.length,
    buffer,
  };
}

function mockResponse(): Response & { body?: unknown } {
  const response = {
    body: undefined as unknown,
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
    setHeader() {
      return this;
    },
  };
  return response as unknown as Response & { body?: unknown };
}

describe('signed local file storage', () => {
  let storageRoot: string;
  let testUser: ITestUser;
  let companyId: string;
  let storage: LocalFileStorage;
  const fileIds: string[] = [];

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'seminai-int-storage-'));
    storage = new LocalFileStorage({
      root: storageRoot,
      publicBaseUrl: 'http://127.0.0.1:8081',
      signingSecret: 'integration-signing-secret',
    });
    testUser = await createTestUser();
    const company = await createTestCompany({ userId: testUser.id, name: 'Storage Farm' });
    companyId = company.id;
  });

  afterAll(async () => {
    if (fileIds.length > 0) {
      await prisma.file.deleteMany({ where: { id: { in: fileIds } } });
    }
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('lets a queue worker read an uploaded object and serves a signed download', async () => {
    const uploader = new FileService(testUser.id, storageRoot, storage);
    const url = await uploader.uploadFile(createSyntheticFile(), testUser.id, 'queue', 'text/plain');
    const worker = new FileService(testUser.id, storageRoot, storage);
    const stored = await worker.getFileFromUrl(url);
    expect(stored.buffer.toString('utf8')).toBe('queue-readable-bytes');

    const file = await prisma.file.create({
      data: {
        id: randomUUID(),
        name: 'queue.txt',
        url,
        companyId,
        path: 'queue',
        type: 'text/plain',
        metadata: { uploadedBy: testUser.id },
      },
    });
    fileIds.push(file.id);

    const controller = new FileReadController(createResourceAccessGuard(prisma), storage, storage);
    const created = mockResponse();
    await controller.createReadUrl(
      { user: { id: testUser.id }, params: { id: file.id }, query: {} } as unknown as Request,
      created,
    );
    const signedUrl = (created.body as { data: { url: string } }).data.url;
    const parsed = new URL(signedUrl);
    const downloaded = mockResponse();
    await controller.downloadSigned(
      {
        query: {
          tenant: parsed.searchParams.get('tenant'),
          key: parsed.searchParams.get('key'),
          signature: parsed.searchParams.get('signature'),
          expires: parsed.searchParams.get('expires'),
        },
      } as unknown as Request,
      downloaded,
    );
    const body = downloaded.body;
    expect(Buffer.isBuffer(body) ? body.toString('utf8') : String(body)).toBe(
      'queue-readable-bytes',
    );
  });

  it('rejects a forged signed download and unknown tenant access to metadata', async () => {
    const uploader = new FileService(testUser.id, storageRoot, storage);
    const url = await uploader.uploadFile(createSyntheticFile(), testUser.id, 'private', 'text/plain');
    const file = await prisma.file.create({
      data: {
        id: randomUUID(),
        name: 'private.txt',
        url,
        companyId,
        path: 'private',
        type: 'text/plain',
      },
    });
    fileIds.push(file.id);
    const controller = new FileReadController(createResourceAccessGuard(prisma), storage, storage);

    await expect(
      controller.createReadUrl(
        { user: { id: randomUUID() }, params: { id: file.id }, query: {} } as unknown as Request,
        mockResponse(),
      ),
    ).rejects.toBeInstanceOf(AppError);

    const created = mockResponse();
    await controller.createReadUrl(
      { user: { id: testUser.id }, params: { id: file.id }, query: {} } as unknown as Request,
      created,
    );
    const parsed = new URL((created.body as { data: { url: string } }).data.url);
    await expect(
      controller.downloadSigned(
        {
          query: {
            tenant: parsed.searchParams.get('tenant'),
            key: parsed.searchParams.get('key'),
            signature: 'deadbeef',
            expires: parsed.searchParams.get('expires'),
          },
        } as unknown as Request,
        mockResponse(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_SIGNED_URL' });
  });

  it('reports local capabilities without secrets on the public config payload', () => {
    const config = buildPublicRuntimeConfig({
      APP_MODE: 'all',
      STORAGE_DRIVER: 'local',
      QDRANT_URL: undefined,
      TAVILY_API_KEY: undefined,
    });
    expect(config.appMode).toBe('all');
    expect(config.storageDriver).toBe('local');
    expect(config.features.tavily).toBe(false);
  });
});
