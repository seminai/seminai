import { PrismaClient, LabelHistory as LabelHistoryRow } from '@prisma/client';
import {
  CreateLabelHistoryInput,
  LabelFieldChange,
  LabelHistoryActor,
  LabelHistoryRecord,
  LabelHistoryWithUser,
} from '../../domain/dtos/label-history.dto';
import { ILabelHistoryRepository } from '../../domain/repositories/ILabelHistoryRepository';

export class PrismaLabelHistoryRepository implements ILabelHistoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateLabelHistoryInput): Promise<LabelHistoryRecord> {
    const created = await this.prisma.labelHistory.create({
      data: {
        labelExtractionId: input.labelExtractionId,
        userId: input.userId ?? null,
        actorType: input.actorType ?? LabelHistoryActor.USER,
        actorLabel: input.actorLabel ?? null,
        changes: input.changes as unknown as object,
        previousSnapshot: input.previousSnapshot as unknown as object,
      },
    });
    return this.mapToDomain(created);
  }

  async findById(id: string): Promise<LabelHistoryRecord | null> {
    const found = await this.prisma.labelHistory.findUnique({ where: { id } });
    if (!found) return null;
    return this.mapToDomain(found);
  }

  async findByLabelExtractionId(
    labelExtractionId: string,
  ): Promise<ReadonlyArray<LabelHistoryWithUser>> {
    const rows = await this.prisma.labelHistory.findMany({
      where: { labelExtractionId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            name: true,
            profilePictureUrl: true,
          },
        },
      },
    });
    return rows.map((row) => ({
      ...this.mapToDomain(row),
      userName: row.user?.name ?? row.actorLabel ?? 'System',
      userProfilePictureUrl: row.user?.profilePictureUrl ?? null,
    }));
  }

  private mapToDomain(row: LabelHistoryRow): LabelHistoryRecord {
    return {
      id: row.id,
      labelExtractionId: row.labelExtractionId,
      userId: row.userId,
      actorType: row.actorType as LabelHistoryActor,
      actorLabel: row.actorLabel,
      changes: row.changes as unknown as ReadonlyArray<LabelFieldChange>,
      previousSnapshot: row.previousSnapshot as Record<string, unknown>,
      createdAt: row.createdAt,
    };
  }
}
