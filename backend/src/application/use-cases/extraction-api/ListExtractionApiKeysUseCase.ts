import type { ExtractionApiKeySummary } from '../../../domain/dtos/extraction-api.dto';
import type { IExtractionApiKeyRepository } from '../../../domain/repositories/IExtractionApiKeyRepository';

export class ListExtractionApiKeysUseCase {
  constructor(private readonly keyRepository: IExtractionApiKeyRepository) {}

  async execute(userId: string): Promise<ReadonlyArray<ExtractionApiKeySummary>> {
    const keys = await this.keyRepository.listByUserId(userId);
    return keys.map((key) => ({
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      createdAt: key.createdAt.toISOString(),
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
      revokedAt: key.revokedAt?.toISOString() ?? null,
    }));
  }
}
