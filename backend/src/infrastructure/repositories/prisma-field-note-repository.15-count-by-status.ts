import type { PrismaFieldNoteRepositoryContext } from './prisma-field-note-repository.context';

export async function prismaFieldNoteRepositoryCountByStatus(this: PrismaFieldNoteRepositoryContext, userId: string): Promise<Record<string, number>> {
    const counts = await this.prisma.fieldNote.groupBy({
      by: ['status'],
      where: { userId },
      _count: { status: true },
    });

    const result: Record<string, number> = {
      PENDING: 0,
      PROCESSING: 0,
      PROCESSED: 0,
      FAILED: 0,
      MANUALLY_REVIEWED: 0,
    };

    counts.forEach((count) => {
      result[count.status] = count._count.status;
    });

    return result;
  }
