import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppError } from '../../../../domain/errors/AppError';
import { LocalFileStorage } from '../LocalFileStorage';

describe('LocalFileStorage signed reads', () => {
  let root: string;
  let storage: LocalFileStorage;
  const now = { value: 1_700_000_000_000 };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'seminai-local-storage-'));
    storage = new LocalFileStorage({
      root,
      publicBaseUrl: 'http://127.0.0.1:8081',
      signingSecret: 'test-signing-secret',
      now: () => now.value,
    });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('uploads, lists, exists, and deletes inside a tenant', async () => {
    const uploaded = await storage.upload({
      tenantId: 'tenant-a',
      path: 'docs',
      name: 'note.txt',
      contentType: 'text/plain',
      content: new TextEncoder().encode('hello'),
    });

    expect(uploaded.url).toMatch(/^local-storage:\/\/\/tenant-a\/docs\//);
    expect(await storage.exists({ tenantId: 'tenant-a', url: uploaded.url })).toBe(true);
    expect(await storage.list({ tenantId: 'tenant-a', path: 'docs' })).toHaveLength(1);

    await storage.delete({ tenantId: 'tenant-a', url: uploaded.url });
    expect(await storage.exists({ tenantId: 'tenant-a', url: uploaded.url })).toBe(false);
  });

  it('issues an HMAC read URL that can be consumed once valid', async () => {
    const uploaded = await storage.upload({
      tenantId: 'tenant-a',
      path: 'docs',
      name: 'note.txt',
      contentType: 'text/plain',
      content: new TextEncoder().encode('signed-body'),
    });
    const signed = await storage.getReadUrl({
      tenantId: 'tenant-a',
      url: uploaded.url,
      expiresInSeconds: 60,
    });
    const parsed = new URL(signed);

    expect(parsed.pathname).toBe('/files/content');
    const file = await storage.readSigned({
      tenantId: parsed.searchParams.get('tenant') ?? '',
      key: parsed.searchParams.get('key') ?? '',
      signature: parsed.searchParams.get('signature') ?? '',
      expires: Number(parsed.searchParams.get('expires')),
    });
    expect(new TextDecoder().decode(file.content)).toBe('signed-body');
  });

  it('rejects a signed URL after expiry', async () => {
    const uploaded = await storage.upload({
      tenantId: 'tenant-a',
      path: 'docs',
      name: 'note.txt',
      contentType: 'text/plain',
      content: new TextEncoder().encode('expired'),
    });
    const signed = await storage.getReadUrl({
      tenantId: 'tenant-a',
      url: uploaded.url,
      expiresInSeconds: 1,
    });
    now.value += 5_000;
    const parsed = new URL(signed);

    await expect(
      storage.readSigned({
        tenantId: parsed.searchParams.get('tenant') ?? '',
        key: parsed.searchParams.get('key') ?? '',
        signature: parsed.searchParams.get('signature') ?? '',
        expires: Number(parsed.searchParams.get('expires')),
      }),
    ).rejects.toMatchObject({ code: 'SIGNED_URL_EXPIRED' } satisfies Partial<AppError>);
  });

  it('rejects cross-tenant reads and forged signed URLs', async () => {
    const uploaded = await storage.upload({
      tenantId: 'tenant-a',
      path: 'docs',
      name: 'note.txt',
      contentType: 'text/plain',
      content: new TextEncoder().encode('secret'),
    });

    await expect(
      storage.getReadUrl({ tenantId: 'tenant-b', url: uploaded.url }),
    ).rejects.toThrow('File does not belong to the configured tenant');

    const signed = await storage.getReadUrl({ tenantId: 'tenant-a', url: uploaded.url });
    const parsed = new URL(signed);
    await expect(
      storage.readSigned({
        tenantId: 'tenant-b',
        key: parsed.searchParams.get('key') ?? '',
        signature: parsed.searchParams.get('signature') ?? '',
        expires: Number(parsed.searchParams.get('expires')),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SIGNED_URL' } satisfies Partial<AppError>);
  });
});
