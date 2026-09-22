import { AppError } from '../../../domain/errors/AppError';
import { ContactEmailDTO, EmailAttachment } from '../../../domain/dtos/contact-email.dto';
import { IEmailRepository } from '../../../domain/repositories/IEmailRepository';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 80;
const MAX_BODY_LENGTH = 4000;
const CONTACT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const CONTACT_RATE_LIMIT_MAX_ATTEMPTS = 3;

interface RateLimitEntry {
  count: number;
  expiresAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export interface SendContactEmailRequest {
  name: string;
  email: string;
  body?: string;
  senderIp: string;
  attachments?: EmailAttachment[];
}

export class SendContactEmailUseCase {
  constructor(private readonly emailRepository: IEmailRepository) {}

  async execute(request: SendContactEmailRequest): Promise<void> {
    const normalizedEmail = this.normalizeEmail(request.email);
    const normalizedName = this.normalizeName(request.name);
    const normalizedBody = this.normalizeBody(request.body);
    const validatedAttachments = this.validateAttachments(request.attachments);
    this.enforceRateLimit(normalizedEmail, request.senderIp);
    const contactEmail: ContactEmailDTO = {
      name: normalizedName,
      email: normalizedEmail,
      body: normalizedBody,
      attachments: validatedAttachments,
    };
    await this.emailRepository.sendContactEmail(contactEmail);
  }

  private validateAttachments(attachments?: EmailAttachment[]): EmailAttachment[] | undefined {
    if (!attachments || attachments.length === 0) {
      return undefined;
    }
    const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
    const MAX_TOTAL_SIZE = 20 * 1024 * 1024;
    const ALLOWED_MIME_TYPES = ['application/pdf'];
    let totalSize = 0;
    for (const attachment of attachments) {
      if (!ALLOWED_MIME_TYPES.includes(attachment.contentType)) {
        throw AppError.badRequest(
          'Only PDF files are allowed as attachments',
          'INVALID_ATTACHMENT_TYPE',
        );
      }
      if (attachment.content.length > MAX_ATTACHMENT_SIZE) {
        throw AppError.badRequest(
          'Each attachment must be smaller than 10MB',
          'ATTACHMENT_TOO_LARGE',
        );
      }
      totalSize += attachment.content.length;
    }
    if (totalSize > MAX_TOTAL_SIZE) {
      throw AppError.badRequest(
        'Total attachments size must be smaller than 20MB',
        'ATTACHMENTS_TOTAL_SIZE_TOO_LARGE',
      );
    }
    return attachments;
  }

  private normalizeName(name: string): string {
    if (!name) {
      throw AppError.badRequest('Name is required', 'MISSING_NAME');
    }
    const trimmedName = name.trim();
    if (trimmedName.length < MIN_NAME_LENGTH || trimmedName.length > MAX_NAME_LENGTH) {
      throw AppError.badRequest('Name length is invalid', 'INVALID_NAME_LENGTH');
    }
    return trimmedName;
  }

  private normalizeEmail(email: string): string {
    if (!email) {
      throw AppError.badRequest('Email is required', 'MISSING_EMAIL');
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      throw AppError.badRequest('Email format is invalid', 'INVALID_EMAIL_FORMAT');
    }
    return normalizedEmail;
  }

  private normalizeBody(body?: string): string {
    if (!body) {
      return '';
    }
    const normalizedBody = body.trim();
    if (normalizedBody.length > MAX_BODY_LENGTH) {
      throw AppError.badRequest('Body is too long', 'INVALID_BODY_LENGTH');
    }
    return normalizedBody;
  }

  private enforceRateLimit(email: string, senderIp: string): void {
    const origin = senderIp || 'unknown';
    const key = `${origin}:${email}`;
    const now = Date.now();
    const entry = rateLimitStore.get(key);
    if (entry && entry.expiresAt > now && entry.count >= CONTACT_RATE_LIMIT_MAX_ATTEMPTS) {
      throw AppError.tooManyRequests(
        'Too many contact requests. Please try again later.',
        'CONTACT_RATE_LIMIT',
      );
    }
    if (!entry || entry.expiresAt <= now) {
      rateLimitStore.set(key, {
        count: 1,
        expiresAt: now + CONTACT_RATE_LIMIT_WINDOW_MS,
      });
      return;
    }
    rateLimitStore.set(key, {
      count: entry.count + 1,
      expiresAt: entry.expiresAt,
    });
  }
}
