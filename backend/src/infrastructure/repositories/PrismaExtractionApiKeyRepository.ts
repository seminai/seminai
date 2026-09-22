import type { PrismaClient } from '@prisma/client';
import type {
  CreateExtractionApiKeyInput,
  ExtractionApiKeyRecord,
  IExtractionApiKeyRepository,
} from '../../domain/repositories/IExtractionApiKeyRepository';

export class PrismaExtractionApiKeyRepository implements IExtractionApiKeyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateExtractionApiKeyInput): Promise<ExtractionApiKeyRecord> {
    const created = await this.prisma.extractionApiKey.create({
      data: {
        userId: input.userId,
        name: input.name,
        keyPrefix: input.keyPrefix,
        keyHash: input.keyHash,
      },
    });
    return this.toRecord(created);
  }

  async findByIdForUser(id: string, userId: string): Promise<ExtractionApiKeyRecord | null> {
    const row = await this.prisma.extractionApiKey.findFirst({ where: { id, userId } });
    return row ? this.toRecord(row) : null;
  }

  async findByKeyHash(keyHash: string): Promise<ExtractionApiKeyRecord | null> {
    const row = await this.prisma.extractionApiKey.findUnique({ where: { keyHash } });
    return row ? this.toRecord(row) : null;
  }

  async listByUserId(userId: string): Promise<ReadonlyArray<ExtractionApiKeyRecord>> {
    const rows = await this.prisma.extractionApiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toRecord(row));
  }

  async revoke(id: string, userId: string): Promise<ExtractionApiKeyRecord> {
    const updated = await this.prisma.extractionApiKey.update({
      where: { id, userId },
      data: { revokedAt: new Date() },
    });
    return this.toRecord(updated);
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.prisma.extractionApiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }

  private toRecord(row: {
    id: string;
    userId: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
    revokedAt: Date | null;
    lastUsedAt: Date | null;
    createdAt: Date;
  }): ExtractionApiKeyRecord {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      keyPrefix: row.keyPrefix,
      keyHash: row.keyHash,
      revokedAt: row.revokedAt,
      lastUsedAt: row.lastUsedAt,
      createdAt: row.createdAt,
    };
  }
}
