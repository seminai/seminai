import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { S3FileStorage } from '../S3FileStorage';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(async () => 'https://s3.example.test/signed'),
}));

interface StoredObject {
  readonly body: Uint8Array;
  readonly type: string;
}

describe('S3FileStorage', () => {
  const objects = new Map<string, StoredObject>();

  const client = {
    send: jest.fn(async (command: object) => {
      const name = command.constructor.name;
      const input = (command as { readonly input: Record<string, unknown> }).input;
      if (name === PutObjectCommand.name) {
        objects.set(String(input.Key), {
          body: input.Body as Uint8Array,
          type: String(input.ContentType),
        });
        return {};
      }
      if (name === GetObjectCommand.name || name === HeadObjectCommand.name) {
        const stored = objects.get(String(input.Key));
        if (!stored) {
          const error = new Error('missing') as Error & {
            $metadata: { httpStatusCode: number };
          };
          error.$metadata = { httpStatusCode: 404 };
          throw error;
        }
        if (name === HeadObjectCommand.name) return {};
        return {
          Body: { transformToByteArray: async () => stored.body },
          ContentType: stored.type,
        };
      }
      return { Contents: [...objects.entries()].map(([Key, item]) => ({ Key, Size: item.body.length })) };
    }),
  } as unknown as S3Client;

  const storage = new S3FileStorage({
    bucket: 'seminai-files',
    region: 'eu-west-1',
    client,
  });

  beforeEach(() => {
    objects.clear();
    (client.send as jest.Mock).mockClear();
  });

  it('stores and reads a tenant-prefixed object', async () => {
    const uploaded = await storage.upload({
      tenantId: 'tenant-a',
      path: 'docs',
      name: 'note.txt',
      contentType: 'text/plain',
      content: new TextEncoder().encode('s3-body'),
    });

    expect(uploaded.url).toMatch(/^s3-storage:\/\/seminai-files\/tenant-a\/docs\//);
    const read = await storage.read({ tenantId: 'tenant-a', url: uploaded.url });
    expect(new TextDecoder().decode(read.content)).toBe('s3-body');
    expect(await storage.exists({ tenantId: 'tenant-a', url: uploaded.url })).toBe(true);
    expect(await storage.getReadUrl({ tenantId: 'tenant-a', url: uploaded.url })).toBe(
      'https://s3.example.test/signed',
    );
  });

  it('rejects reads across tenant boundaries', async () => {
    const uploaded = await storage.upload({
      tenantId: 'tenant-a',
      path: 'docs',
      name: 'note.txt',
      contentType: 'text/plain',
      content: new TextEncoder().encode('secret'),
    });

    await expect(storage.read({ tenantId: 'tenant-b', url: uploaded.url })).rejects.toThrow(
      'File does not belong to the configured tenant',
    );
  });
});
