import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapInstanceSecrets } from '../bootstrapSecrets';

describe('bootstrapInstanceSecrets', () => {
  let dataDir: string;
  const originalJwt = process.env.JWT_SECRET;
  const originalEnc = process.env.ENCRYPTION_SECRET;
  const originalDataDir = process.env.DATA_DIR;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'seminai-secrets-'));
    delete process.env.JWT_SECRET;
    delete process.env.ENCRYPTION_SECRET;
    process.env.DATA_DIR = dataDir;
  });

  afterEach(async () => {
    if (originalJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwt;
    if (originalEnc === undefined) delete process.env.ENCRYPTION_SECRET;
    else process.env.ENCRYPTION_SECRET = originalEnc;
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    await rm(dataDir, { recursive: true, force: true });
  });

  it('generates and persists secrets on first boot', async () => {
    const first = bootstrapInstanceSecrets(process.env);
    expect(first.jwtSecret.length).toBeGreaterThanOrEqual(32);
    expect(process.env.JWT_SECRET).toBe(first.jwtSecret);
    const jwtOnDisk = (await readFile(join(first.secretsDir, 'jwt'), 'utf8')).trim();
    expect(jwtOnDisk).toBe(first.jwtSecret);

    delete process.env.JWT_SECRET;
    delete process.env.ENCRYPTION_SECRET;
    const second = bootstrapInstanceSecrets(process.env);
    expect(second.jwtSecret).toBe(first.jwtSecret);
    expect(second.encryptionSecret).toBe(first.encryptionSecret);
  });

  it('prefers environment values over generated files', () => {
    process.env.JWT_SECRET = 'a'.repeat(40);
    process.env.ENCRYPTION_SECRET = 'b'.repeat(40);
    const result = bootstrapInstanceSecrets(process.env);
    expect(result.jwtSecret).toBe('a'.repeat(40));
    expect(result.encryptionSecret).toBe('b'.repeat(40));
  });
});
