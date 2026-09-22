import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import { PrismaChatRepository } from '../../repositories/PrismaChatRepository';
import { ChatCategory } from '../../../domain/entities/Chat';

export class ChatController {
  /**
   * Get all chats for the authenticated user.
   * Optional filter by category.
   * GET /chats?category=DOSAGE_AGENT
   */
  async list(req: Request, res: Response): Promise<Response> {
    if (!req.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { category } = req.query as { category?: string };

    const chatRepository = new PrismaChatRepository(prisma);

    let chats;
    if (category && Object.values(ChatCategory).includes(category as ChatCategory)) {
      chats = await chatRepository.findByUserIdAndCategory(req.user.id, category as ChatCategory);
    } else {
      chats = await chatRepository.findByUserId(req.user.id);
    }

    return res.status(200).json({
      status: 'success',
      data: chats.map((chat) => ({
        id: chat.id,
        threadId: chat.threadId,
        category: chat.category,
        modelName: chat.modelName,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        lastMessage: chat.messages?.[0]
          ? {
              content: chat.messages[0].content,
              role: chat.messages[0].role,
              createdAt: chat.messages[0].createdAt,
            }
          : null,
      })),
    });
  }

  /**
   * Get a single chat with all messages.
   * GET /chats/:id
   */
  async getById(req: Request, res: Response): Promise<Response> {
    if (!req.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { id } = req.params;

    if (!id) {
      throw AppError.badRequest('Chat ID is required', 'INVALID_CHAT_ID');
    }

    const chatRepository = new PrismaChatRepository(prisma);
    const chat = await chatRepository.findByIdWithMessages(id);

    if (!chat) {
      throw AppError.notFound('Chat not found', 'CHAT_NOT_FOUND');
    }

    if (chat.userId !== req.user.id) {
      throw AppError.forbidden('You do not have access to this chat', 'CHAT_ACCESS_DENIED');
    }

    return res.status(200).json({
      status: 'success',
      data: {
        id: chat.id,
        threadId: chat.threadId,
        category: chat.category,
        modelName: chat.modelName,
        temperature: chat.temperature,
        metadata: chat.metadata,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        messages: chat.messages?.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          contentBlocks: msg.contentBlocks,
          status: msg.status,
          pendingToolCalls: msg.pendingToolCalls,
          error: msg.error,
          metadata: msg.metadata,
          createdAt: msg.createdAt,
        })),
      },
    });
  }

  /**
   * Delete a chat and all its messages.
   * DELETE /chats/:id
   */
  async delete(req: Request, res: Response): Promise<Response> {
    if (!req.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { id } = req.params;

    if (!id) {
      throw AppError.badRequest('Chat ID is required', 'INVALID_CHAT_ID');
    }

    const chatRepository = new PrismaChatRepository(prisma);
    const chat = await chatRepository.findById(id);

    if (!chat) {
      throw AppError.notFound('Chat not found', 'CHAT_NOT_FOUND');
    }

    if (chat.userId !== req.user.id) {
      throw AppError.forbidden('You do not have access to this chat', 'CHAT_ACCESS_DENIED');
    }

    await chatRepository.delete(id);

    return res.status(200).json({
      status: 'success',
      message: 'Chat deleted successfully',
    });
  }
}
