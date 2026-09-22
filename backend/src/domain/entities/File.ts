export class File {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly url: string,
    public readonly companyId: string,
    public readonly path?: string,
    public readonly type?: string,
    public readonly metadata?: unknown,
    public readonly createdAt?: Date,
    public readonly updatedAt?: Date,
    public readonly expiresAt?: Date,
    public readonly reminderDaysBefore?: number,
    public readonly alertStatus?: string,
  ) {}

  /** Whether the file's expiry date has passed. */
  isExpired(referenceDate: Date = new Date()): boolean {
    if (!this.expiresAt) return false;
    return this.expiresAt.getTime() < referenceDate.getTime();
  }

  /** Whether the file is within the reminder window before expiry. */
  isWithinReminderWindow(referenceDate: Date = new Date()): boolean {
    if (!this.expiresAt || !this.reminderDaysBefore) return false;
    const reminderDate = new Date(this.expiresAt);
    reminderDate.setDate(reminderDate.getDate() - this.reminderDaysBefore);
    return referenceDate.getTime() >= reminderDate.getTime() && !this.isExpired(referenceDate);
  }
}
