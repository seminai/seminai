import {
  PrismaClient,
  Prisma,
  Chat as PrismaChat,
  Message as PrismaMessage,
  ChatCategory as PrismaChatCategory,
} from '@prisma/client';
import { IChatRepository } from '../../domain/repositories/IChatRepository';
import { Chat, ChatCategory } from '../../domain/entities/Chat';
import { PrismaMessageRepository } from './PrismaMessageRepository';

export class PrismaChatRepository implements IChatRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(chat: Chat): Promise<Chat> {
    const created = await this.prisma.chat.create({
      data: {
        id: chat.id,
        userId: chat.userId,
        category: chat.category as PrismaChatCategory,
        threadId: chat.threadId,
        modelName: chat.modelName,
        temperature: chat.temperature,
        metadata: this.mapMetadataToPrisma(chat.metadata),
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      },
    });
    return this.toDomain(created);
  }

  async findById(id: string): Promise<Chat | null> {
    const found = await this.prisma.chat.findUnique({
      where: { id },
      include: { messages: { orderBy: { sequence: 'asc' } } },
    });

    return found ? this.toDomain(found) : null;
  }

  async findByThreadId(threadId: string): Promise<Chat | null> {
    const found = await this.prisma.chat.findUnique({
      where: { threadId },
      include: { messages: { orderBy: { sequence: 'asc' } } },
    });

    return found ? this.toDomain(found) : null;
  }

  async findByThreadIdAndUserId(threadId: string, userId: string): Promise<Chat | null> {
    const found = await this.prisma.chat.findFirst({
      where: { threadId, userId },
      include: { messages: { orderBy: { sequence: 'asc' } } },
    });

    return found ? this.toDomain(found) : null;
  }

  async findByUserId(userId: string): Promise<Chat[]> {
    const chats = await this.prisma.chat.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { sequence: 'asc' }, take: 1 } },
    });

    return chats.map((c) => this.toDomain(c));
  }

  async findByUserIdAndCategory(userId: string, category: ChatCategory): Promise<Chat[]> {
    const chats = await this.prisma.chat.findMany({
      where: { userId, category: category as PrismaChatCategory },
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { sequence: 'asc' }, take: 1 } },
    });

    return chats.map((c) => this.toDomain(c));
  }

  async findByIdWithMessages(id: string): Promise<Chat | null> {
    const found = await this.prisma.chat.findUnique({
      where: { id },
      include: { messages: { orderBy: { sequence: 'asc' } } },
    });

    return found ? this.toDomain(found) : null;
  }

  async update(chat: Chat): Promise<Chat> {
    const updated = await this.prisma.chat.update({
      where: { id: chat.id },
      data: {
        category: chat.category as PrismaChatCategory,
        modelName: chat.modelName,
        temperature: chat.temperature,
        metadata: this.mapMetadataToPrisma(chat.metadata),
        updatedAt: new Date(),
      },
    });
    return this.toDomain(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.chat.delete({
      where: { id },
    });
  }

  private toDomain(prismaChat: PrismaChat & { messages?: PrismaMessage[] }): Chat {
    const messages = prismaChat.messages
      ? prismaChat.messages.map((m) => PrismaMessageRepository.toDomainStatic(m))
      : undefined;

    return new Chat(
      prismaChat.id,
      prismaChat.userId,
      prismaChat.category as unknown as ChatCategory,
      prismaChat.threadId,
      prismaChat.modelName ?? undefined,
      prismaChat.temperature ?? undefined,
      this.mapMetadataToDomain(prismaChat.metadata),
      prismaChat.createdAt,
      prismaChat.updatedAt,
      messages,
    );
  }

  private mapMetadataToPrisma(
    metadata?: Record<string, unknown>,
  ): Prisma.InputJsonValue | undefined {
    if (!metadata) {
      return undefined;
    }
    return metadata as Prisma.InputJsonValue;
  }

  private mapMetadataToDomain(
    metadata: Prisma.JsonValue | null,
  ): Record<string, unknown> | undefined {
    if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') {
      return undefined;
    }
    return metadata as Record<string, unknown>;
  }
}
