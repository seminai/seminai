/**
 * Raw attachment received with an inbound email.
 * Stored through the configured file driver and linked after import.
 */
export class EmailAttachment {
  constructor(
    public readonly id: string,
    public readonly ingestionId: string,
    public readonly fileName: string,
    public readonly mimeType: string,
    public readonly sizeBytes: number,
    public readonly storageUrl: string,
    public readonly storagePath: string,
    public readonly createdAt: Date,
    public readonly fileId?: string,
  ) {}

  /** Whether this attachment has been persisted as a domain File. */
  hasBeenImported(): boolean {
    return Boolean(this.fileId);
  }
}
