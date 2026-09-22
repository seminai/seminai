import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { INotificationRepository } from '../../../domain/repositories/INotificationRepository';
import type { NotificationResponseDTO } from '../../../domain/dtos/notification.dto';

export class NotificationController {
  constructor(private readonly notificationRepository: INotificationRepository) {}

  /** GET /notifications — list notifications for the authenticated user. */
  async list(request: Request, response: Response): Promise<Response> {
    const userId = request.user?.id;
    if (!userId) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const isReadParam = request.query.isRead as string | undefined;
    const isRead = isReadParam === 'true' ? true : isReadParam === 'false' ? false : undefined;
    const limit = request.query.limit ? Number(request.query.limit) : 50;
    const offset = request.query.offset ? Number(request.query.offset) : 0;
    const notifications = await this.notificationRepository.findByUserId(userId, {
      isRead,
      limit,
      offset,
    });
    const data: NotificationResponseDTO[] = notifications.map((n) => ({
      id: n.id,
      userId: n.userId,
      companyId: n.companyId ?? null,
      type: n.type,
      title: n.title,
      message: n.message,
      metadata: n.metadata ?? null,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    }));
    return response.status(200).json({ status: 'success', data: { notifications: data } });
  }

  /** GET /notifications/unread-count */
  async countUnread(request: Request, response: Response): Promise<Response> {
    const userId = request.user?.id;
    if (!userId) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const count = await this.notificationRepository.countUnread(userId);
    return response.status(200).json({ status: 'success', data: { count } });
  }

  /** PATCH /notifications/:id/read */
  async markAsRead(request: Request, response: Response): Promise<Response> {
    const userId = request.user?.id;
    if (!userId) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { id } = request.params;
    if (!id) {
      throw AppError.badRequest('Missing notification ID', 'MISSING_NOTIFICATION_ID');
    }
    await this.notificationRepository.markAsRead(id);
    return response.status(200).json({ status: 'success' });
  }

  /** PATCH /notifications/read-all */
  async markAllAsRead(request: Request, response: Response): Promise<Response> {
    const userId = request.user?.id;
    if (!userId) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    await this.notificationRepository.markAllAsRead(userId);
    return response.status(200).json({ status: 'success' });
  }
}
