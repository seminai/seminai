import type { PrismaFieldRepositoryContext } from './prisma-field-repository.context';

export async function prismaFieldRepositoryClearSourceFileIds(this: PrismaFieldRepositoryContext, fileIds: readonly string[]): Promise<number> {
    if (fileIds.length === 0) return 0;
    const result = await this.prisma.field.updateMany({
      where: { sourceFileId: { in: [...fileIds] } },
      data: { sourceFileId: null },
    });
    return result.count;
  }
