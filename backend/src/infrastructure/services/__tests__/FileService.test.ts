import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileService } from '../FileService';
import type { MulterFile } from '../Multer';

function createSyntheticFile(name = 'sample.txt'): MulterFile {
  const buffer = Buffer.from('synthetic fixture only', 'utf8');
  return {
    fieldname: 'file',
    originalname: name,
    encoding: '7bit',
    mimetype: 'text/plain',
    size: buffer.length,
    buffer,
  };
}

describe('FileService local storage', () => {
  let storageRoot: string;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'seminai-storage-test-'));
  });

  afterEach(async () => {
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('stores and reads a synthetic file inside its tenant scope', async () => {
    const service = new FileService('tenant-a', storageRoot);
    const url = await service.uploadFile(
      createSyntheticFile(),
      'tenant-a',
      'documents/incoming',
      'text/plain',
    );

    const actualFile = await service.getFileFromUrl(url);

    expect(url).toMatch(/^local-storage:\/\/\/tenant-a\/documents\/incoming\//);
    expect(actualFile.buffer.toString('utf8')).toBe('synthetic fixture only');
  });

  it('rejects reads across tenant boundaries', async () => {
    const ownerService = new FileService('tenant-a', storageRoot);
    const url = await ownerService.uploadFile(
      createSyntheticFile(),
      'tenant-a',
      'documents',
      'text/plain',
    );
    const otherTenantService = new FileService('tenant-b', storageRoot);

    await expect(otherTenantService.getFileFromUrl(url)).rejects.toThrow(
      'File does not belong to the configured tenant',
    );
  });

  it('lists and deletes only tenant-local objects', async () => {
    const service = new FileService('tenant-a', storageRoot);
    const url = await service.uploadFile(
      createSyntheticFile('delete-me.txt'),
      'tenant-a',
      'documents',
      'text/plain',
    );

    expect(await service.getUserFiles('documents')).toHaveLength(1);
    await service.deleteFile(url);
    expect(await service.getUserFiles('documents')).toEqual([]);
  });

  it('rejects attempted traversal segments', async () => {
    const service = new FileService('tenant-a', storageRoot);

    await expect(
      service.uploadFile(createSyntheticFile(), 'tenant-a', '../../outside', 'text/plain'),
    ).rejects.toThrow('Invalid storage path segment');
  });
});
