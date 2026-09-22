import nodemailer from 'nodemailer';
import { EmailAttachment, SendEmailParams } from './email-service.support';
import type { EmailServiceContext } from './email-service.context';
import { emailServiceInitializeTransporter } from './email-service.01-initialize-transporter';
import { emailServiceDoInitializeTransporter } from './email-service.02-do-initialize-transporter';
import { emailServiceVerifyConfiguration } from './email-service.03-verify-configuration';
import { emailServiceEnsureInitialized } from './email-service.04-ensure-initialized';
import { emailServiceResetTransporter } from './email-service.05-reset-transporter';
import { emailServiceIsConnectionError } from './email-service.06-is-connection-error';
import { emailServiceSendEmail } from './email-service.07-send-email';
import { emailServiceSendRawEmail } from './email-service.08-send-raw-email';
import { emailServiceSendWelcomeEmail } from './email-service.09-send-welcome-email';
import { emailServiceSendPasswordResetEmail } from './email-service.10-send-password-reset-email';
import { emailServiceSendInvitationEmail } from './email-service.11-send-invitation-email';
import { emailServiceSendUserAddedToCompanyEmail } from './email-service.12-send-user-added-to-company-email';
import { emailServiceSendWorkspaceInvitationEmail } from './email-service.13-send-workspace-invitation-email';
import { emailServiceSendTestEmail } from './email-service.14-send-test-email';


export class EmailService {

  private static instance: EmailService | null = null;
  transporter: nodemailer.Transporter | null = null;
  initializationPromise: Promise<void> | null = null;
  isInitialized = false;
  initializationError: Error | null = null;

  constructor() {
    // Costruttore privato per implementare il pattern Singleton
  }

  static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  async initializeTransporter(): Promise<void> {
    return emailServiceInitializeTransporter.call(this as unknown as EmailServiceContext);
  }

  async doInitializeTransporter(): Promise<void> {
    return emailServiceDoInitializeTransporter.call(this as unknown as EmailServiceContext);
  }

  async verifyConfiguration(): Promise<void> {
    return emailServiceVerifyConfiguration.call(this as unknown as EmailServiceContext);
  }

  async ensureInitialized(): Promise<void> {
    return emailServiceEnsureInitialized.call(this as unknown as EmailServiceContext);
  }

  resetTransporter(): void {
    emailServiceResetTransporter.call(this as unknown as EmailServiceContext);
  }

  isConnectionError(error: unknown): boolean {
    return emailServiceIsConnectionError.call(this as unknown as EmailServiceContext, error);
  }

  async sendEmail(
    to: string,
    subject: string,
    text: string,
    html?: string,
    attachments?: EmailAttachment[],
  ): Promise<void> {
    return emailServiceSendEmail.call(this as unknown as EmailServiceContext, to, subject, text, html, attachments);
  }

  async sendRawEmail(params: SendEmailParams): Promise<void> {
    return emailServiceSendRawEmail.call(this as unknown as EmailServiceContext, params);
  }

  async sendWelcomeEmail(email: string, name: string, token: string): Promise<void> {
    return emailServiceSendWelcomeEmail.call(this as unknown as EmailServiceContext, email, name, token);
  }

  async sendPasswordResetEmail(email: string, name: string, token: string): Promise<void> {
    return emailServiceSendPasswordResetEmail.call(this as unknown as EmailServiceContext, email, name, token);
  }

  async sendInvitationEmail(
    email: string,
    name: string,
    temporaryPassword: string,
    invitedBy: string,
    companyId?: string,
    companyName?: string,
  ): Promise<void> {
    return emailServiceSendInvitationEmail.call(this as unknown as EmailServiceContext, email, name, temporaryPassword, invitedBy, companyId, companyName);
  }

  async sendUserAddedToCompanyEmail(
    email: string,
    name: string,
    companyId: string,
    companyName: string,
    invitedBy: string,
    role: string,
  ): Promise<void> {
    return emailServiceSendUserAddedToCompanyEmail.call(this as unknown as EmailServiceContext, email, name, companyId, companyName, invitedBy, role);
  }

  async sendWorkspaceInvitationEmail(
    email: string,
    name: string,
    invitedBy: string,
    workspaceName: string,
    invitationToken?: string,
  ): Promise<void> {
    return emailServiceSendWorkspaceInvitationEmail.call(this as unknown as EmailServiceContext, email, name, invitedBy, workspaceName, invitationToken);
  }

  async sendTestEmail(email: string): Promise<void> {
    return emailServiceSendTestEmail.call(this as unknown as EmailServiceContext, email);
  }
}
