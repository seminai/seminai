import { NextFunction, Request, Response } from 'express';
import { ensureExtractionApiKey } from '../infrastructure/http/middlewares/ensureExtractionApiKey';
import { prisma } from '../infrastructure/repositories/Prisma';
import { hashApiKey } from '../infrastructure/services/extraction-api/api-key-crypto';

jest.mock('../infrastructure/repositories/Prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    extractionApiKey: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

describe('ensureExtractionApiKey', () => {
  const next = jest.fn() as NextFunction;
  const response = {} as Response;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects requests without X-Api-Key header', async () => {
    const request = { headers: {} } as Request;
    await ensureExtractionApiKey(request, response, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: 'MISSING_API_KEY' }),
    );
  });

  it('attaches extractionApiAuth for valid keys', async () => {
    const secret = 'sk_live_test_secret_value';
    (prisma.extractionApiKey.findUnique as jest.Mock).mockResolvedValue({
      id: 'key-1',
      userId: 'user-1',
      revokedAt: null,
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-1',
      isBlocked: false,
      isDeactivated: false,
    });
    (prisma.extractionApiKey.update as jest.Mock).mockResolvedValue({});
    const request = {
      headers: { 'x-api-key': secret },
    } as unknown as Request;
    await ensureExtractionApiKey(request, response, next);
    expect(prisma.extractionApiKey.findUnique).toHaveBeenCalledWith({
      where: { keyHash: hashApiKey(secret) },
    });
    expect(request.extractionApiAuth).toEqual({ userId: 'user-1', apiKeyId: 'key-1' });
    expect(next).toHaveBeenCalledWith();
  });
});
