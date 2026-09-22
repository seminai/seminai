import { Chat, ChatCategory } from '../entities/Chat';

export interface IChatRepository {
  create(chat: Chat): Promise<Chat>;
  findById(id: string): Promise<Chat | null>;
  findByIdWithMessages(id: string): Promise<Chat | null>;
  findByThreadId(threadId: string): Promise<Chat | null>;
  findByThreadIdAndUserId(threadId: string, userId: string): Promise<Chat | null>;
  findByUserId(userId: string): Promise<Chat[]>;
  findByUserIdAndCategory(userId: string, category: ChatCategory): Promise<Chat[]>;
  update(chat: Chat): Promise<Chat>;
  delete(id: string): Promise<void>;
}
