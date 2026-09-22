import { Notification } from '../entities/Notification';

/** Params for paginated notification queries. */
export interface FindNotificationsParams {
  readonly isRead?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export interface INotificationRepository {
  create(notification: Notification): Promise<Notification>;
  findByUserId(userId: string, params?: FindNotificationsParams): Promise<Notification[]>;
  countUnread(userId: string): Promise<number>;
  markAsRead(id: string): Promise<void>;
  markAllAsRead(userId: string): Promise<void>;
}
