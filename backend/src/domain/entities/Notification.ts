import { randomUUID } from 'crypto';

/** Props required to create a new Notification. */
export interface CreateNotificationProps {
  readonly userId: string;
  readonly type: string;
  readonly title: string;
  readonly message: string;
  readonly companyId?: string;
  readonly metadata?: unknown;
}

export class Notification {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly type: string,
    public readonly title: string,
    public readonly message: string,
    public readonly isRead: boolean,
    public readonly createdAt: Date,
    public readonly companyId?: string,
    public readonly metadata?: unknown,
  ) {}

  /** Factory method — creates a new unread notification with generated id. */
  static create(props: CreateNotificationProps): Notification {
    return new Notification(
      randomUUID(),
      props.userId,
      props.type,
      props.title,
      props.message,
      false,
      new Date(),
      props.companyId,
      props.metadata,
    );
  }
}
