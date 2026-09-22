import { ContactEmailDTO } from '../../domain/dtos/contact-email.dto';
import { AppError } from '../../domain/errors/AppError';
import { IEmailRepository } from '../../domain/repositories/IEmailRepository';
import { EmailService } from '../services/EmailService';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatBodyAsHtml = (body: string): string => {
  return body
    .split(/\r?\n/)
    .map((line) => `<p style="margin:8px 0;">${escapeHtml(line)}</p>`)
    .join('');
};

export class EmailRepository implements IEmailRepository {
  constructor(private readonly emailService: EmailService) {}

  async sendContactEmail({ name, email, body, attachments }: ContactEmailDTO): Promise<void> {
    const targetEmail = process.env.CONTACT_FORM_TARGET_EMAIL;
    if (!targetEmail) {
      throw AppError.featureNotConfigured('Contact email');
    }
    const subject = `New contact request from ${name}`;
    const attachmentInfo =
      attachments && attachments.length > 0
        ? `\nAttachments: ${attachments.map((a) => a.filename).join(', ')}`
        : '';
    const plainTextBody = [
      'New contact request from the public form:',
      `Name: ${name}`,
      `Email: ${email}`,
      'Message:',
      body,
      attachmentInfo,
    ].join('\n');
    const htmlAttachmentInfo =
      attachments && attachments.length > 0
        ? `<p><strong>Attachments:</strong> ${attachments.map((a) => escapeHtml(a.filename)).join(', ')}</p>`
        : '';
    const htmlBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
        </head>
        <body style="font-family: Arial, sans-serif; color: #1b1c1d;">
          <h2 style="color:#2f855a;">New contact request</h2>
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          ${htmlAttachmentInfo}
          <div style="margin-top:16px;padding:12px;border:1px solid #e2e8f0;border-radius:8px;background:#f7fafc;">
            <strong>Message</strong>
            ${formatBodyAsHtml(body)}
          </div>
        </body>
      </html>
    `;
    await this.emailService.sendRawEmail({
      to: targetEmail,
      subject,
      text: plainTextBody,
      html: htmlBody,
      attachments,
    });
  }
}
