import { PrismaClient, Notification as PrismaNotificationModel } from '@prisma/client';
import {
  INotificationRepository,
  FindNotificationsParams,
} from '../../domain/repositories/INotificationRepository';
import { Notification } from '../../domain/entities/Notification';

export class PrismaNotificationRepository implements INotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(notification: Notification): Promise<Notification> {
    const row = await this.prisma.notification.create({
      data: {
        id: notification.id,
        userId: notification.userId,
        companyId: notification.companyId ?? null,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        metadata: (notification.metadata as object) ?? undefined,
        isRead: notification.isRead,
      },
    });
    return this.toDomain(row);
  }

  async findByUserId(userId: string, params?: FindNotificationsParams): Promise<Notification[]> {
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(params?.isRead !== undefined ? { isRead: params.isRead } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: params?.limit ?? 50,
      skip: params?.offset ?? 0,
    });
    return rows.map((r) => this.toDomain(r));
  }

  async countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  async markAsRead(id: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  private toDomain(row: PrismaNotificationModel): Notification {
    return new Notification(
      row.id,
      row.userId,
      row.type,
      row.title,
      row.message,
      row.isRead,
      row.createdAt,
      row.companyId || undefined,
      row.metadata || undefined,
    );
  }
}
