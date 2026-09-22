import type { EmailServiceContext } from './email-service.context';

export function emailServiceResetTransporter(this: EmailServiceContext): void {
    this.transporter = null;
    this.isInitialized = false;
    this.initializationPromise = null;
    this.initializationError = null;
  }
