import type { EmailServiceContext } from './email-service.context';

export async function emailServiceVerifyConfiguration(this: EmailServiceContext): Promise<void> {
    if (!this.transporter) {
      throw new Error('Transporter non inizializzato');
    }
    try {
      await this.transporter.verify();
      console.log('✅ Configurazione email verificata con successo');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = (error as NodeJS.ErrnoException).code;
      console.error('❌ Errore verifica configurazione email:', {
        message: errorMessage,
        code: errorCode,
        hint: 'Possibili cause: credenziali errate, password app Gmail non configurata, problemi di rete/firewall',
      });
      throw error;
    }
  }
