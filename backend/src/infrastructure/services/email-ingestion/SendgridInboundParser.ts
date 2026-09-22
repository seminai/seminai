import { type Request } from 'express';
import {
  type ParsedAttachmentDto,
  type ParsedInboundEmailDto,
} from '../../../domain/dtos/email-inbound.dto';
import { type MulterFile } from '../Multer';

/**
 * Subset of SendGrid Inbound Parse multipart body fields we read.
 * SendGrid sends additional fields (envelope, spam_score, etc.) that we ignore in v1.
 */
interface SendgridInboundBody {
  readonly from?: string;
  readonly to?: string;
  readonly subject?: string;
  readonly text?: string;
  readonly html?: string;
  readonly headers?: string;
  readonly attachments?: string;
}

const MESSAGE_ID_REGEX = /^Message-ID:\s*<([^>]+)>/im;
const IN_REPLY_TO_REGEX = /^In-Reply-To:\s*<([^>]+)>/im;
const REFERENCES_REGEX = /^References:\s*(.+?)(?=\r?\n[A-Za-z-]+:|\r?\n\r?\n|$)/ims;
const FROM_NAME_ADDRESS_REGEX = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/;
const ADDRESS_LIST_SEPARATOR = /[,;]/;

/**
 * Parses a SendGrid Inbound Parse multipart/form-data request into
 * a provider-agnostic ParsedInboundEmailDto.
 *
 * Pure transformation with no side effects, Prisma, or storage access.
 */
export class SendgridInboundParser {
  parse(request: Request): ParsedInboundEmailDto {
    const body = (request.body ?? {}) as SendgridInboundBody;
    const files = this.readUploadedFiles(request);
    const rawHeaders = this.parseHeaders(body.headers ?? '');
    const { address: fromAddress, name: fromName } = this.parseAddress(body.from ?? '');
    const messageId = this.extractMessageId(body.headers ?? '', rawHeaders);
    return {
      messageId,
      fromAddress,
      fromName,
      toAddresses: this.parseAddressList(body.to ?? ''),
      subject: body.subject ?? '',
      bodyText: body.text ?? '',
      bodyHtml: body.html,
      rawHeaders,
      inReplyTo: this.extractInReplyTo(body.headers ?? ''),
      references: this.extractReferences(body.headers ?? ''),
      attachments: files.map((file) => this.toAttachmentDto(file)),
    };
  }

  private readUploadedFiles(request: Request): ReadonlyArray<MulterFile> {
    const files = request.files;
    if (Array.isArray(files)) return files as ReadonlyArray<MulterFile>;
    if (!files) return [];
    return Object.values(files).flat() as ReadonlyArray<MulterFile>;
  }

  private toAttachmentDto(file: MulterFile): ParsedAttachmentDto {
    return {
      fileName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
      sizeBytes: file.size,
    };
  }

  private parseHeaders(raw: string): Record<string, string> {
    if (!raw) return {};
    const headers: Record<string, string> = {};
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const colon = line.indexOf(':');
      if (colon <= 0) continue;
      const key = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      if (key && value) headers[key.toLowerCase()] = value;
    }
    return headers;
  }

  private extractMessageId(rawHeaders: string, parsedHeaders: Record<string, string>): string {
    const match = MESSAGE_ID_REGEX.exec(rawHeaders);
    if (match) return match[1];
    const fromMap = parsedHeaders['message-id'];
    if (fromMap) return fromMap.replace(/[<>]/g, '');
    return `synthetic-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private extractInReplyTo(rawHeaders: string): string | undefined {
    const match = IN_REPLY_TO_REGEX.exec(rawHeaders);
    return match ? match[1] : undefined;
  }

  private extractReferences(rawHeaders: string): ReadonlyArray<string> | undefined {
    const match = REFERENCES_REGEX.exec(rawHeaders);
    if (!match) return undefined;
    const ids = match[1].match(/<([^>]+)>/g);
    if (!ids) return undefined;
    return ids.map((id) => id.replace(/[<>]/g, ''));
  }

  private parseAddress(raw: string): { address: string; name?: string } {
    const trimmed = raw.trim();
    if (!trimmed) return { address: '' };
    const namedMatch = FROM_NAME_ADDRESS_REGEX.exec(trimmed);
    if (namedMatch) {
      const name = namedMatch[1].trim();
      return { address: namedMatch[2].trim().toLowerCase(), name: name || undefined };
    }
    return { address: trimmed.toLowerCase() };
  }

  private parseAddressList(raw: string): ReadonlyArray<string> {
    if (!raw) return [];
    return raw
      .split(ADDRESS_LIST_SEPARATOR)
      .map((part) => this.parseAddress(part).address)
      .filter((address) => address.length > 0);
  }
}
