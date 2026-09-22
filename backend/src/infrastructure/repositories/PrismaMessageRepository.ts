import {
  PrismaClient,
  Message as PrismaMessage,
  MessageRole as PrismaMessageRole,
  AgentResponseStatus as PrismaAgentResponseStatus,
} from '@prisma/client';
import { IMessageRepository } from '../../domain/repositories/IMessageRepository';
import {
  Message,
  MessageRole,
  AgentResponseStatus,
  ContentBlock,
  MessageCost,
} from '../../domain/entities/Message';

export class PrismaMessageRepository implements IMessageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(message: Message): Promise<Message> {
    const created = await this.prisma.message.create({
      data: {
        id: message.id,
        chatId: message.chatId,
        role: message.role as PrismaMessageRole,
        content: message.content,
        sequence: message.sequence,
        contentBlocks: message.contentBlocks ?? undefined,
        status: message.status as PrismaAgentResponseStatus,
        pendingToolCalls: message.pendingToolCalls ?? undefined,
        error: message.error,
        cost: message.cost ?? undefined,
        metadata: message.metadata ?? undefined,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
      },
    });
    return PrismaMessageRepository.toDomainStatic(created);
  }

  async findById(id: string): Promise<Message | null> {
    const found = await this.prisma.message.findUnique({
      where: { id },
    });

    return found ? PrismaMessageRepository.toDomainStatic(found) : null;
  }

  async findByChatId(chatId: string): Promise<Message[]> {
    const messages = await this.prisma.message.findMany({
      where: { chatId },
      orderBy: { sequence: 'asc' },
    });

    return messages.map((m) => PrismaMessageRepository.toDomainStatic(m));
  }

  async findLatestByChatId(chatId: string): Promise<Message | null> {
    const message = await this.prisma.message.findFirst({
      where: { chatId },
      orderBy: { sequence: 'desc' },
    });

    return message ? PrismaMessageRepository.toDomainStatic(message) : null;
  }

  async update(message: Message): Promise<Message> {
    const updated = await this.prisma.message.update({
      where: { id: message.id },
      data: {
        content: message.content,
        contentBlocks: message.contentBlocks ?? undefined,
        status: message.status as PrismaAgentResponseStatus,
        pendingToolCalls: message.pendingToolCalls ?? undefined,
        error: message.error,
        cost: message.cost ?? undefined,
        metadata: message.metadata ?? undefined,
        updatedAt: new Date(),
      },
    });
    return PrismaMessageRepository.toDomainStatic(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.message.delete({
      where: { id },
    });
  }

  static toDomainStatic(prismaMessage: PrismaMessage): Message {
    return new Message(
      prismaMessage.id,
      prismaMessage.chatId,
      prismaMessage.role as unknown as MessageRole,
      prismaMessage.content,
      prismaMessage.sequence,
      (prismaMessage.contentBlocks as unknown as ContentBlock[]) ?? undefined,
      (prismaMessage.status as unknown as AgentResponseStatus) ?? undefined,
      (prismaMessage.pendingToolCalls as unknown as any[]) ?? undefined,
      prismaMessage.error ?? undefined,
      (prismaMessage.cost as unknown as MessageCost) ?? undefined,
      (prismaMessage.metadata as Record<string, any>) ?? undefined,
      prismaMessage.createdAt,
      prismaMessage.updatedAt,
    );
  }
}
