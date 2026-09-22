export interface UpdateFileExpiryDTO {
  readonly expiresAt?: string | null;
  readonly reminderDaysBefore?: number;
}

export interface ExpiringFileDTO {
  readonly id: string;
  readonly name: string;
  readonly companyId: string;
  readonly expiresAt: string;
  readonly reminderDaysBefore: number;
  readonly alertStatus: string;
  readonly daysUntilExpiry: number;
}
