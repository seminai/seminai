import { AppError } from '../../../domain/errors/AppError';
import type { ExtractionApiKeySummary } from '../../../domain/dtos/extraction-api.dto';
import type { IExtractionApiKeyRepository } from '../../../domain/repositories/IExtractionApiKeyRepository';

interface RevokeExtractionApiKeyDTO {
  readonly userId: string;
  readonly keyId: string;
}

export class RevokeExtractionApiKeyUseCase {
  constructor(private readonly keyRepository: IExtractionApiKeyRepository) {}

  async execute(input: RevokeExtractionApiKeyDTO): Promise<ExtractionApiKeySummary> {
    const existing = await this.keyRepository.findByIdForUser(input.keyId, input.userId);
    if (!existing) {
      throw AppError.notFound('API key not found', 'API_KEY_NOT_FOUND');
    }
    if (existing.revokedAt) {
      throw AppError.badRequest('API key already revoked', 'API_KEY_ALREADY_REVOKED');
    }
    const revoked = await this.keyRepository.revoke(input.keyId, input.userId);
    return {
      id: revoked.id,
      name: revoked.name,
      keyPrefix: revoked.keyPrefix,
      createdAt: revoked.createdAt.toISOString(),
      lastUsedAt: revoked.lastUsedAt?.toISOString() ?? null,
      revokedAt: revoked.revokedAt?.toISOString() ?? null,
    };
  }
}
