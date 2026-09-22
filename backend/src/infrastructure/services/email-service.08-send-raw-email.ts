import { SendEmailParams } from './email-service.support';
import type { EmailServiceContext } from './email-service.context';

export async function emailServiceSendRawEmail(this: EmailServiceContext, { to, subject, text, html, attachments }: SendEmailParams): Promise<void> {
    await this.sendEmail(to, subject, text, html, attachments);
  }
