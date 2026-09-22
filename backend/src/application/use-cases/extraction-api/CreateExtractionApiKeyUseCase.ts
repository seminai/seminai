import { AppError } from '../../../domain/errors/AppError';
import type {
  ExtractionApiKeyCreated,
  ExtractionApiKeySummary,
} from '../../../domain/dtos/extraction-api.dto';
import type { IExtractionApiKeyRepository } from '../../../domain/repositories/IExtractionApiKeyRepository';
import {
  generateApiKeySecret,
  hashApiKey,
} from '../../../infrastructure/services/extraction-api/api-key-crypto';

interface CreateExtractionApiKeyDTO {
  readonly userId: string;
  readonly name: string;
}

export class CreateExtractionApiKeyUseCase {
  constructor(private readonly keyRepository: IExtractionApiKeyRepository) {}

  async execute(input: CreateExtractionApiKeyDTO): Promise<ExtractionApiKeyCreated> {
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      throw AppError.badRequest('API key name is required', 'MISSING_API_KEY_NAME');
    }
    const { secret, prefix } = generateApiKeySecret();
    const created = await this.keyRepository.create({
      userId: input.userId,
      name: trimmedName,
      keyPrefix: prefix,
      keyHash: hashApiKey(secret),
    });
    return {
      key: this.toSummary(created),
      secret,
    };
  }

  private toSummary(record: {
    readonly id: string;
    readonly name: string;
    readonly keyPrefix: string;
    readonly createdAt: Date;
    readonly lastUsedAt: Date | null;
    readonly revokedAt: Date | null;
  }): ExtractionApiKeySummary {
    return {
      id: record.id,
      name: record.name,
      keyPrefix: record.keyPrefix,
      createdAt: record.createdAt.toISOString(),
      lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
      revokedAt: record.revokedAt?.toISOString() ?? null,
    };
  }
}
