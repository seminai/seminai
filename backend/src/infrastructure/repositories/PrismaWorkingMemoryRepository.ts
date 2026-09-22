import type { IWorkingMemoryRepository } from '../../domain/repositories/IWorkingMemoryRepository';

/**
 * Minimal delegate for the AgentWorkingMemory table.
 * Decouples from PrismaClient so the code compiles before `prisma generate`.
 */
interface AgentWorkingMemoryDelegate {
  findUnique(args: { where: { threadId: string } }): Promise<{ data: unknown } | null>;
  upsert(args: {
    where: { threadId: string };
    create: { threadId: string; data: object };
    update: { data: object };
  }): Promise<unknown>;
  deleteMany(args: { where: { threadId: string } }): Promise<unknown>;
}

/**
 * Prisma implementation of IWorkingMemoryRepository.
 * Stores working memory as a JSON column keyed by threadId.
 *
 * Note: After running `prisma migrate dev` and `prisma generate`,
 * the delegate can be replaced with `PrismaClient['agentWorkingMemory']`.
 */
export class PrismaWorkingMemoryRepository implements IWorkingMemoryRepository {
  constructor(private readonly delegate: AgentWorkingMemoryDelegate) {}

  async load(threadId: string): Promise<Record<string, unknown> | null> {
    const row = await this.delegate.findUnique({ where: { threadId } });
    if (!row) return null;
    return row.data as Record<string, unknown>;
  }

  async save(threadId: string, data: Record<string, unknown>): Promise<void> {
    await this.delegate.upsert({
      where: { threadId },
      create: { threadId, data: data as object },
      update: { data: data as object },
    });
  }

  async delete(threadId: string): Promise<void> {
    await this.delegate.deleteMany({ where: { threadId } });
  }
}
