import { PrismaClient, AgentStreamEvent as PrismaAgentStreamEvent, Prisma } from '@prisma/client';
import { AgentStreamEvent } from '../../domain/entities/AgentStreamEvent';
import {
  AppendStreamEventInput,
  IAgentStreamEventRepository,
} from '../../domain/repositories/IAgentStreamEventRepository';

export class PrismaAgentStreamEventRepository implements IAgentStreamEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async append(input: AppendStreamEventInput): Promise<AgentStreamEvent> {
    const latest = await this.prisma.agentStreamEvent.findFirst({
      where: { threadId: input.threadId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    const seq = (latest?.seq ?? 0) + 1;
    const created = await this.prisma.agentStreamEvent.create({
      data: {
        threadId: input.threadId,
        seq,
        type: input.type,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
    return this.toDomain(created);
  }

  async findByThread(
    threadId: string,
    sinceSeq: number,
    limit?: number,
  ): Promise<readonly AgentStreamEvent[]> {
    const rows = await this.prisma.agentStreamEvent.findMany({
      where: { threadId, seq: { gt: sinceSeq } },
      orderBy: { seq: 'asc' },
      take: limit,
    });
    return rows.map((row) => this.toDomain(row));
  }

  async getLatestSeq(threadId: string): Promise<number | null> {
    const latest = await this.prisma.agentStreamEvent.findFirst({
      where: { threadId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    return latest?.seq ?? null;
  }

  async getLatest(threadId: string): Promise<AgentStreamEvent | null> {
    const latest = await this.prisma.agentStreamEvent.findFirst({
      where: { threadId },
      orderBy: { seq: 'desc' },
    });
    return latest ? this.toDomain(latest) : null;
  }

  async deleteBeforeSeq(threadId: string, beforeSeq: number): Promise<number> {
    const result = await this.prisma.agentStreamEvent.deleteMany({
      where: { threadId, seq: { lt: beforeSeq } },
    });
    return result.count;
  }

  private toDomain(row: PrismaAgentStreamEvent): AgentStreamEvent {
    return new AgentStreamEvent(
      row.id,
      row.threadId,
      row.seq,
      row.type,
      row.payload as Record<string, unknown>,
      row.createdAt,
    );
  }
}
