import type { EmailServiceContext } from './email-service.context';

export async function emailServiceInitializeTransporter(this: EmailServiceContext): Promise<void> {
    if (this.isInitialized && this.transporter) {
      return;
    }
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    this.initializationPromise = this.doInitializeTransporter();
    return this.initializationPromise;
  }
