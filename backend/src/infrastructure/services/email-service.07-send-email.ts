import nodemailer from 'nodemailer';
import { AppError } from '../../domain/errors/AppError';
import { EmailAttachment } from './email-service.support';
import type { EmailServiceContext } from './email-service.context';

export async function emailServiceSendEmail(this: EmailServiceContext, to: string, subject: string, text: string, html?: string, attachments?: EmailAttachment[]): Promise<void> {
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.ensureInitialized();
        if (!this.transporter) {
          throw new Error('Transporter non disponibile');
        }
        const fromEmail = process.env.EMAIL_USER || 'noreply@seminai.tech';
        if (attempt > 1) {
          console.log(`📧 Tentativo ${attempt}/${maxRetries} invio email a: ${to}`);
        } else {
          console.log('📧 Preparazione invio email:', {
            to,
            subject,
            from: fromEmail,
            attachmentsCount: attachments?.length || 0,
          });
        }
        const mailOptions: nodemailer.SendMailOptions = {
          from: `"${process.env.APP_NAME || 'SeminAI'}" <${fromEmail}>`,
          to,
          subject,
          text,
          html,
        };
        if (attachments && attachments.length > 0) {
          mailOptions.attachments = attachments.map((att) => ({
            filename: att.filename,
            content: att.content,
            contentType: att.contentType,
          }));
        }
        const info = await this.transporter.sendMail(mailOptions);
        console.log('✉️ Email inviata con successo:', {
          messageId: info.messageId,
          response: info.response,
          attempt,
          attachmentsCount: attachments?.length || 0,
        });
        return;
      } catch (error) {
        const isConnError = this.isConnectionError(error);
        console.error(`❌ Errore invio email (tentativo ${attempt}/${maxRetries}):`, {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: (error as NodeJS.ErrnoException).code,
          isConnectionError: isConnError,
        });
        if (isConnError && attempt < maxRetries) {
          console.log('🔄 Reinizializzo transporter per tentativo successivo...');
          this.resetTransporter();
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          continue;
        }
        throw AppError.internal('Failed to send email');
      }
    }
  }
