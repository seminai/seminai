import nodemailer from 'nodemailer';
import type { EmailServiceContext } from './email-service.context';

export async function emailServiceDoInitializeTransporter(this: EmailServiceContext): Promise<void> {
    try {
      const isTest = process.env.NODE_ENV === 'test' || process.env.EMAIL_TRANSPORT === 'json';
      const isDevelopment = process.env.NODE_ENV === 'development';
      if (isTest) {
        this.transporter = nodemailer.createTransport({
          jsonTransport: true,
        });
        console.log('✅ Servizio email inizializzato per TEST (jsonTransport)');
        this.isInitialized = true;
      } else if (isDevelopment) {
        this.transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'localhost',
          port: Number(process.env.SMTP_PORT) || 1025,
          secure: false,
          pool: true,
          maxConnections: 5,
          tls: {
            rejectUnauthorized: false,
          },
        });
        console.log('✅ Servizio email inizializzato per DEVELOPMENT (Mailhog)');
        this.isInitialized = true;
      } else {
        const emailUser = process.env.EMAIL_USER;
        const emailPassword = process.env.EMAIL_PASSWORD;
        if (!emailUser || !emailPassword) {
          throw new Error(
            "EMAIL_USER e EMAIL_PASSWORD devono essere configurate nelle variabili d'ambiente",
          );
        }
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: {
            user: emailUser,
            pass: emailPassword,
          },
          pool: true,
          maxConnections: 5,
          maxMessages: 100,
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 10000,
        });
        try {
          await this.verifyConfiguration();
          console.log('✅ Servizio email inizializzato per PRODUCTION (Gmail)');
          this.isInitialized = true;
        } catch (verifyError) {
          this.initializationError =
            verifyError instanceof Error ? verifyError : new Error(String(verifyError));
          console.error('❌ Errore verifica configurazione email:', {
            message: this.initializationError.message,
            code: (verifyError as NodeJS.ErrnoException).code,
            hint: "Verifica che EMAIL_USER e EMAIL_PASSWORD siano corretti. Per Gmail, usa una password app specifica invece della password dell'account.",
          });
          if (process.env.NODE_ENV !== 'development') {
            throw this.initializationError;
          }
        }
      }
    } catch (error) {
      this.initializationError = error instanceof Error ? error : new Error(String(error));
      console.error('❌ Errore configurazione email:', {
        message: this.initializationError.message,
        code: (error as NodeJS.ErrnoException).code,
      });
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          "⚠️ Modalità development: l'applicazione continuerà nonostante l'errore email",
        );
      } else {
        throw this.initializationError;
      }
    }
  }
