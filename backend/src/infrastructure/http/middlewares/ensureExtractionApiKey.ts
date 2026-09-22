import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../repositories/Prisma';
import { PrismaExtractionApiKeyRepository } from '../../repositories/PrismaExtractionApiKeyRepository';
import { hashApiKey } from '../../services/extraction-api/api-key-crypto';
import { AppError } from '../../../domain/errors/AppError';

declare module 'express-serve-static-core' {
  interface Request {
    extractionApiAuth?: {
      readonly userId: string;
      readonly apiKeyId: string;
    };
  }
}

const keyRepository = new PrismaExtractionApiKeyRepository(prisma);

export async function ensureExtractionApiKey(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawKey = request.headers['x-api-key'];
    const apiKey = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (!apiKey) {
      throw AppError.unauthorized('Missing X-Api-Key header', 'MISSING_API_KEY');
    }
    const record = await keyRepository.findByKeyHash(hashApiKey(apiKey));
    if (!record || record.revokedAt) {
      throw AppError.unauthorized('Invalid or revoked API key', 'INVALID_API_KEY');
    }
    const user = await prisma.user.findUnique({ where: { id: record.userId } });
    if (!user || user.isBlocked || user.isDeactivated) {
      throw AppError.forbidden('API account is not active', 'API_ACCOUNT_INACTIVE');
    }
    request.extractionApiAuth = { userId: record.userId, apiKeyId: record.id };
    void keyRepository.touchLastUsed(record.id);
    next();
  } catch (error) {
    next(error);
  }
}
