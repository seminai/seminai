import { Readable } from 'stream';
import { type ParsedAttachmentDto } from '../../../domain/dtos/email-inbound.dto';
import { type EmailAttachmentSeed } from '../../../domain/repositories/IEmailIngestionRepository';
import { FileService } from '../FileService';
import { type MulterFile } from '../Multer';

const PATH_SEGMENT_SANITIZER = /[^a-zA-Z0-9._-]/g;

/**
 * Persists raw email attachments through the configured storage driver and returns the seeds
 * needed to create EmailAttachment rows.
 */
export class EmailIngestionAttachmentStorage {
  constructor(private readonly fileService: FileService = new FileService()) {}

  async storeAll({
    attachments,
    userId,
    messageId,
  }: StoreAllInput): Promise<ReadonlyArray<EmailAttachmentSeed>> {
    const ownerKey = userId ?? 'unknown';
    const messageKey = this.sanitizeSegment(messageId).slice(0, 80) || 'no-msg-id';
    const seeds: EmailAttachmentSeed[] = [];
    for (const attachment of attachments) {
      const seed = await this.storeOne({ attachment, ownerKey, messageKey });
      seeds.push(seed);
    }
    return seeds;
  }

  private async storeOne(input: StoreOneInput): Promise<EmailAttachmentSeed> {
    const multerLike = this.toMulterFile(input.attachment);
    const path = `email-ingest/${input.messageKey}`;
    const url = await this.fileService.uploadFile(
      multerLike,
      input.ownerKey,
      path,
      'email-attachment',
    );
    return {
      fileName: input.attachment.fileName,
      mimeType: input.attachment.mimeType,
      sizeBytes: input.attachment.sizeBytes,
      storageUrl: url,
      storagePath: path,
    };
  }

  private toMulterFile(attachment: ParsedAttachmentDto): MulterFile {
    return {
      fieldname: 'attachment',
      originalname: attachment.fileName,
      encoding: '7bit',
      mimetype: attachment.mimeType,
      size: attachment.sizeBytes,
      buffer: attachment.buffer,
      stream: Readable.from(attachment.buffer),
    } as MulterFile;
  }

  private sanitizeSegment(input: string): string {
    return input.replace(PATH_SEGMENT_SANITIZER, '_');
  }
}

interface StoreAllInput {
  readonly attachments: ReadonlyArray<ParsedAttachmentDto>;
  readonly userId?: string;
  readonly messageId: string;
}

interface StoreOneInput {
  readonly attachment: ParsedAttachmentDto;
  readonly ownerKey: string;
  readonly messageKey: string;
}
