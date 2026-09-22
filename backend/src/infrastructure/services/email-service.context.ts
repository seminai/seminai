import nodemailer from 'nodemailer';
import { EmailAttachment, SendEmailParams } from './email-service.support';

export interface EmailServiceContext {
  transporter: nodemailer.Transporter | null;
  initializationPromise: Promise<void> | null;
  initializationError: Error | null;
  isInitialized: boolean;
  initializeTransporter(): Promise<void>;
  doInitializeTransporter(): Promise<void>;
  verifyConfiguration(): Promise<void>;
  ensureInitialized(): Promise<void>;
  resetTransporter(): void;
  isConnectionError(error: unknown): boolean;
  sendEmail(to: string, subject: string, text: string, html?: string, attachments?: EmailAttachment[]): Promise<void>;
  sendRawEmail({ to, subject, text, html, attachments }: SendEmailParams): Promise<void>;
  sendWelcomeEmail(email: string, name: string, token: string): Promise<void>;
  sendPasswordResetEmail(email: string, name: string, token: string): Promise<void>;
  sendInvitationEmail(email: string, name: string, temporaryPassword: string, invitedBy: string, companyId?: string, companyName?: string): Promise<void>;
  sendUserAddedToCompanyEmail(email: string, name: string, companyId: string, companyName: string, invitedBy: string, role: string): Promise<void>;
  sendWorkspaceInvitationEmail(email: string, name: string, invitedBy: string, workspaceName: string, invitationToken?: string): Promise<void>;
  sendTestEmail(email: string): Promise<void>;
}
