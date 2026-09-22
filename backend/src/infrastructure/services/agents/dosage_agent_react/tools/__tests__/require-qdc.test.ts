import { getQdcClientIdForUser } from '../qdc/require-qdc';
import { PrismaSettingsRepository } from '../../../../../repositories/PrismaSettingsRepository';

jest.mock('../../../../../repositories/Prisma', () => ({ prisma: {} }));
jest.mock('../../../../../repositories/PrismaSettingsRepository');

const MockedRepo = PrismaSettingsRepository as jest.MockedClass<typeof PrismaSettingsRepository>;

function stubSettings(qdcApiKey: string | null): void {
  MockedRepo.prototype.findByUserId = jest
    .fn()
    .mockResolvedValue(
      qdcApiKey === null ? null : { qdcApiKey, hasQdcApiKey: () => Boolean(qdcApiKey) },
    );
}

describe('getQdcClientIdForUser', () => {
  const savedEnvClientId = process.env.IMAGE_LINE_CLIENT_ID;

  afterEach(() => {
    if (savedEnvClientId === undefined) {
      delete process.env.IMAGE_LINE_CLIENT_ID;
    } else {
      process.env.IMAGE_LINE_CLIENT_ID = savedEnvClientId;
    }
    jest.clearAllMocks();
  });

  it('prefers the service-level IMAGE_LINE_CLIENT_ID env var without touching Settings', async () => {
    process.env.IMAGE_LINE_CLIENT_ID = ' env-client ';
    stubSettings('settings-client');
    const actualClientId = await getQdcClientIdForUser('user-1');
    expect(actualClientId).toBe('env-client');
    expect(MockedRepo.prototype.findByUserId).not.toHaveBeenCalled();
  });

  it('falls back to Settings.qdcApiKey when the env var is unset', async () => {
    delete process.env.IMAGE_LINE_CLIENT_ID;
    stubSettings('settings-client');
    const actualClientId = await getQdcClientIdForUser('user-1');
    expect(actualClientId).toBe('settings-client');
  });

  it('returns null when neither env var nor Settings are configured', async () => {
    delete process.env.IMAGE_LINE_CLIENT_ID;
    stubSettings(null);
    const actualClientId = await getQdcClientIdForUser('user-1');
    expect(actualClientId).toBeNull();
  });
});
