import { bootstrapInviteCode, rotateInviteCode } from '../bootstrapInviteCode';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('bootstrapInviteCode', () => {
  let dataDir: string;
  const originalInvite = process.env.INVITE_CODE;
  const originalDataDir = process.env.DATA_DIR;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'seminai-invite-'));
    delete process.env.INVITE_CODE;
    process.env.DATA_DIR = dataDir;
  });

  afterEach(async () => {
    if (originalInvite === undefined) delete process.env.INVITE_CODE;
    else process.env.INVITE_CODE = originalInvite;
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    await rm(dataDir, { recursive: true, force: true });
  });

  it('persists a generated invite code across boots', async () => {
    const first = bootstrapInviteCode(process.env);
    expect(first.length).toBeGreaterThan(8);
    const onDisk = (await readFile(join(dataDir, 'secrets', 'invite'), 'utf8')).trim();
    expect(onDisk).toBe(first);
    delete process.env.INVITE_CODE;
    expect(bootstrapInviteCode(process.env)).toBe(first);
  });

  it('rotates the persisted invite code', () => {
    const first = bootstrapInviteCode(process.env);
    const rotated = rotateInviteCode(process.env);
    expect(rotated).not.toBe(first);
    expect(process.env.INVITE_CODE).toBe(rotated);
  });
});
