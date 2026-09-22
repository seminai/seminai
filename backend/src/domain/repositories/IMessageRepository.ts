import { Message } from '../entities/Message';

export interface IMessageRepository {
  create(message: Message): Promise<Message>;
  findById(id: string): Promise<Message | null>;
  findByChatId(chatId: string): Promise<Message[]>;
  update(message: Message): Promise<Message>;
  delete(id: string): Promise<void>;
  findLatestByChatId(chatId: string): Promise<Message | null>;
}
