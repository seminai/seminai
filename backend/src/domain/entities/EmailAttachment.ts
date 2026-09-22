/**
 * Raw attachment received with an inbound email.
 * Stored on GCS; linked to a File row only after import_from_file persists it.
 */
export class EmailAttachment {
  constructor(
    public readonly id: string,
    public readonly ingestionId: string,
    public readonly fileName: string,
    public readonly mimeType: string,
    public readonly sizeBytes: number,
    public readonly gcsUrl: string,
    public readonly gcsPath: string,
    public readonly createdAt: Date,
    public readonly fileId?: string,
  ) {}

  /** Whether this attachment has been persisted as a domain File. */
  hasBeenImported(): boolean {
    return Boolean(this.fileId);
  }
}
