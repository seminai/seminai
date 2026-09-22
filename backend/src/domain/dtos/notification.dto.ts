export interface NotificationResponseDTO {
  readonly id: string;
  readonly userId: string;
  readonly companyId: string | null;
  readonly type: string;
  readonly title: string;
  readonly message: string;
  readonly metadata: unknown;
  readonly isRead: boolean;
  readonly createdAt: string;
}

export interface UnreadCountDTO {
  readonly count: number;
}
