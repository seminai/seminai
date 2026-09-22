import type { EmailServiceContext } from './email-service.context';

export async function emailServiceEnsureInitialized(this: EmailServiceContext): Promise<void> {
    await this.initializeTransporter();
    if (this.initializationError && process.env.NODE_ENV !== 'development') {
      throw this.initializationError;
    }
    if (!this.transporter) {
      throw new Error('Servizio email non inizializzato');
    }
  }
