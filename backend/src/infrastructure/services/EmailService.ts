import nodemailer from 'nodemailer';
import { AppError } from '../../domain/errors/AppError';
import { buildCompanyArchiveLink } from '../utils/frontend-links';

interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export class EmailService {
  private static instance: EmailService | null = null;
  private transporter: nodemailer.Transporter | null = null;
  private initializationPromise: Promise<void> | null = null;
  private isInitialized = false;
  private initializationError: Error | null = null;

  private constructor() {
    // Costruttore privato per implementare il pattern Singleton
  }

  static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  private async initializeTransporter(): Promise<void> {
    if (this.isInitialized && this.transporter) {
      return;
    }
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    this.initializationPromise = this.doInitializeTransporter();
    return this.initializationPromise;
  }

  private async doInitializeTransporter(): Promise<void> {
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

  private async verifyConfiguration(): Promise<void> {
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

  private async ensureInitialized(): Promise<void> {
    await this.initializeTransporter();
    if (this.initializationError && process.env.NODE_ENV !== 'development') {
      throw this.initializationError;
    }
    if (!this.transporter) {
      throw new Error('Servizio email non inizializzato');
    }
  }

  private resetTransporter(): void {
    this.transporter = null;
    this.isInitialized = false;
    this.initializationPromise = null;
    this.initializationError = null;
  }

  private isConnectionError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return (
      message.includes('connection closed') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('socket hang up')
    );
  }

  private async sendEmail(
    to: string,
    subject: string,
    text: string,
    html?: string,
    attachments?: EmailAttachment[],
  ): Promise<void> {
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

  async sendRawEmail({ to, subject, text, html, attachments }: SendEmailParams): Promise<void> {
    await this.sendEmail(to, subject, text, html, attachments);
  }

  async sendWelcomeEmail(email: string, name: string, token: string): Promise<void> {
    const verificationLink = `${process.env.FRONTEND_URL}/auth/verify?token=${token}`;
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #2C3E50;
            background-color: #F9F9F9;
            margin: 0;
            padding: 0;
          }
          .email-container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #FFFFFF;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            background-color: #388e3c;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 8px 8px 0 0;
            background-image: linear-gradient(45deg, #388e3c, #66bb6a);
          }
          .content {
            padding: 30px;
            background-color: white;
          }
          h1 {
            color: #FFFFFF;
            margin: 0;
            font-size: 24px;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.2);
          }
          .welcome-text {
            font-size: 18px;
            color: #388e3c;
            margin-bottom: 20px;
            font-weight: bold;
          }
          .verification-button {
            display: inline-block;
            background-color: #388e3c;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 4px;
            font-weight: bold;
            margin: 20px 0;
            transition: background-color 0.3s ease;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .verification-button:hover {
            background-color: #66bb6a;
          }
          .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 14px;
            border-top: 1px solid #EEE;
          }
          .divider {
            height: 2px;
            background: linear-gradient(to right, #388e3c, #66bb6a);
            margin: 20px 0;
          }
          .features {
            background-color: #f1f8e9;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
          }
          .feature-item {
            margin: 10px 0;
            color: #388e3c;
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <h1>Benvenuto in Seminai</h1>
          </div>
          
          <div class="content">
            <p class="welcome-text">Gentile ${name},</p>
            <p>Grazie per esserti registrato a Seminai, il quaderno di campagna intelligente che semplifica le tue operazioni agricole con l'aiuto dell'AI.</p>
            
            <div class="divider"></div>
            
            <div class="features">
              <p style="font-weight: bold; color: #388e3c;">Con il tuo account potrai:</p>
              <p class="feature-item">🌱 Gestire facilmente il tuo quaderno di campagna</p>
              <p class="feature-item">🤖 Utilizzare l'AI per automatizzare le operazioni agricole</p>
              <p class="feature-item">📊 Monitorare le attività e analizzare i dati della tua azienda</p>
              <p class="feature-item">🌦️ Ricevere suggerimenti personalizzati in base alle condizioni meteo</p>
              <p class="feature-item">📝 Semplificare la compilazione dei registri normativi</p>
            </div>

            <p>Per iniziare a utilizzare Seminai, verifica il tuo indirizzo email:</p>
            
            <div style="text-align: center;">
              <a href="${verificationLink}" class="verification-button">
                Attiva il tuo account
              </a>
            </div>
            
            <div class="divider"></div>
            
            <p>Se non hai richiesto tu questa registrazione, puoi ignorare questa email.</p>
          </div>
          
          <div class="footer">
            <p>© ${new Date().getFullYear()} Seminai. Tutti i diritti riservati.</p>
            <p style="color: #388e3c; font-weight: bold; margin: 10px 0;">L'intelligenza artificiale al servizio dell'agricoltura</p>
            <small>Questa è un'email automatica, ti preghiamo di non rispondere.</small>
          </div>
        </div>
      </body>
      </html>
    `;
    const textContent = `
      Benvenuto in Seminai, ${name}!
      
      Grazie per esserti registrato a Seminai, il quaderno di campagna intelligente che semplifica le tue operazioni agricole con l'aiuto dell'AI.
      
      Con il tuo account potrai:
      - Gestire facilmente il tuo quaderno di campagna
      - Utilizzare l'AI per automatizzare le operazioni agricole
      - Monitorare le attività e analizzare i dati della tua azienda
      - Ricevere suggerimenti personalizzati in base alle condizioni meteo
      - Semplificare la compilazione dei registri normativi
      
      Per attivare il tuo account, visita il seguente link:
      ${verificationLink}
      
      Se non hai richiesto tu questa registrazione, ignora questa email.
      
      © ${new Date().getFullYear()} Seminai.
      L'intelligenza artificiale al servizio dell'agricoltura
    `;
    await this.sendEmail(
      email,
      'Benvenuto in Seminai - Attiva il tuo account',
      textContent,
      htmlContent,
    );
  }

  async sendPasswordResetEmail(email: string, name: string, token: string): Promise<void> {
    const resetLink = `${process.env.FRONTEND_URL}/auth/reset-password?token=${token}`;
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #2C3E50;
            background-color: #F9F9F9;
            margin: 0;
            padding: 0;
          }
          .email-container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #FFFFFF;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            background-color: #388e3c;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 8px 8px 0 0;
            background-image: linear-gradient(45deg, #388e3c, #66bb6a);
          }
          .content {
            padding: 30px;
            background-color: white;
          }
          h1 {
            color: #FFFFFF;
            margin: 0;
            font-size: 24px;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.2);
          }
          .welcome-text {
            font-size: 18px;
            color: #388e3c;
            margin-bottom: 20px;
            font-weight: bold;
          }
          .reset-button {
            display: inline-block;
            background-color: #388e3c;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 4px;
            font-weight: bold;
            margin: 20px 0;
            transition: background-color 0.3s ease;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .reset-button:hover {
            background-color: #66bb6a;
          }
          .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 14px;
            border-top: 1px solid #EEE;
          }
          .divider {
            height: 2px;
            background: linear-gradient(to right, #388e3c, #66bb6a);
            margin: 20px 0;
          }
          .expiry-notice {
            background-color: #fff3e0;
            padding: 10px 15px;
            border-radius: 4px;
            margin: 15px 0;
            color: #e65100;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <h1>Reimposta la tua Password</h1>
          </div>

          <div class="content">
            <p class="welcome-text">Gentile ${name},</p>
            <p>Abbiamo ricevuto una richiesta per reimpostare la password del tuo account Seminai. Clicca il pulsante qui sotto per procedere.</p>

            <div class="divider"></div>

            <div style="text-align: center;">
              <a href="${resetLink}" class="reset-button">
                Reimposta Password
              </a>
            </div>

            <div class="expiry-notice">
              ⏰ Questo link scadrà tra 1 ora.
            </div>

            <div class="divider"></div>

            <p>Se non hai richiesto tu il cambio password, puoi ignorare questa email. La tua password rimarrà invariata.</p>
          </div>

          <div class="footer">
            <p>© ${new Date().getFullYear()} Seminai. Tutti i diritti riservati.</p>
            <p style="color: #388e3c; font-weight: bold; margin: 10px 0;">L'intelligenza artificiale al servizio dell'agricoltura</p>
            <small>Questa è un'email automatica, ti preghiamo di non rispondere.</small>
          </div>
        </div>
      </body>
      </html>
    `;
    const textContent = `
      Reimposta la tua Password

      Gentile ${name},

      Abbiamo ricevuto una richiesta per reimpostare la password del tuo account Seminai.

      Per reimpostare la password, visita il seguente link:
      ${resetLink}

      Questo link scadrà tra 1 ora.

      Se non hai richiesto tu il cambio password, puoi ignorare questa email.
      La tua password rimarrà invariata.

      © ${new Date().getFullYear()} Seminai.
      L'intelligenza artificiale al servizio dell'agricoltura
    `;
    await this.sendEmail(email, 'Seminai - Reimposta la tua password', textContent, htmlContent);
  }

  async sendInvitationEmail(
    email: string,
    name: string,
    temporaryPassword: string,
    invitedBy: string,
    companyId?: string,
    companyName?: string,
  ): Promise<void> {
    const loginLink =
      companyId && companyName
        ? buildCompanyArchiveLink(companyId, companyName)
        : `${process.env.FRONTEND_URL}/login`;
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #2C3E50;
            background-color: #F9F9F9;
            margin: 0;
            padding: 0;
          }
          .email-container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #FFFFFF;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            background-color: #388e3c;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 8px 8px 0 0;
            background-image: linear-gradient(45deg, #388e3c, #66bb6a);
          }
          .content {
            padding: 30px;
            background-color: white;
          }
          h1 {
            color: #FFFFFF;
            margin: 0;
            font-size: 24px;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.2);
          }
          .welcome-text {
            font-size: 18px;
            color: #388e3c;
            margin-bottom: 20px;
            font-weight: bold;
          }
          .login-button {
            display: inline-block;
            background-color: #388e3c;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 4px;
            font-weight: bold;
            margin: 20px 0;
            transition: background-color 0.3s ease;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .login-button:hover {
            background-color: #66bb6a;
          }
          .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 14px;
            border-top: 1px solid #EEE;
          }
          .divider {
            height: 2px;
            background: linear-gradient(to right, #388e3c, #66bb6a);
            margin: 20px 0;
          }
          .credentials {
            background-color: #f1f8e9;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
            border: 1px dashed #388e3c;
          }
          .credential-item {
            margin: 10px 0;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <h1>Invito a Seminai</h1>
          </div>
          
          <div class="content">
            <p class="welcome-text">Gentile ${name},</p>
            <p>Sei stato invitato da ${invitedBy} ad unirti a Seminai, il quaderno di campagna intelligente che semplifica le operazioni agricole con l'aiuto dell'AI.</p>
            
            <div class="divider"></div>
            
            <p>È stato creato un account per te con le seguenti credenziali:</p>
            
            <div class="credentials">
              <p class="credential-item">Email: ${email}</p>
              <p class="credential-item">Password temporanea: ${temporaryPassword}</p>
            </div>
            
            <p>Ti consigliamo di cambiare la password dopo il primo accesso.</p>
            
            <div style="text-align: center;">
              <a href="${loginLink}" class="login-button">
                Accedi a Seminai
              </a>
            </div>
            
            <div class="divider"></div>
            
            <p>Se hai ricevuto questa email per errore, ti preghiamo di ignorarla.</p>
          </div>
          
          <div class="footer">
            <p>© ${new Date().getFullYear()} Seminai. Tutti i diritti riservati.</p>
            <p style="color: #388e3c; font-weight: bold; margin: 10px 0;">L'intelligenza artificiale al servizio dell'agricoltura</p>
            <small>Questa è un'email automatica, ti preghiamo di non rispondere.</small>
          </div>
        </div>
      </body>
      </html>
    `;
    const textContent = `
      Invito a Seminai
      
      Gentile ${name},
      
      Sei stato invitato da ${invitedBy} ad unirti a Seminai, il quaderno di campagna intelligente che semplifica le operazioni agricole con l'aiuto dell'AI.
      
      È stato creato un account per te con le seguenti credenziali:
      - Email: ${email}
      - Password temporanea: ${temporaryPassword}
      
      Ti consigliamo di cambiare la password dopo il primo accesso.
      
      Per accedere, visita: ${loginLink}
      
      Se hai ricevuto questa email per errore, ti preghiamo di ignorarla.
      
      © ${new Date().getFullYear()} Seminai.
      L'intelligenza artificiale al servizio dell'agricoltura
    `;
    await this.sendEmail(email, 'Sei stato invitato a Seminai', textContent, htmlContent);
  }

  async sendUserAddedToCompanyEmail(
    email: string,
    name: string,
    companyId: string,
    companyName: string,
    invitedBy: string,
    role: string,
  ): Promise<void> {
    const loginLink = buildCompanyArchiveLink(companyId, companyName);
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #2C3E50;
            background-color: #F9F9F9;
            margin: 0;
            padding: 0;
          }
          .email-container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #FFFFFF;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            background-color: #388e3c;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 8px 8px 0 0;
            background-image: linear-gradient(45deg, #388e3c, #66bb6a);
          }
          .content {
            padding: 30px;
            background-color: white;
          }
          h1 {
            color: #FFFFFF;
            margin: 0;
            font-size: 24px;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.2);
          }
          .welcome-text {
            font-size: 18px;
            color: #388e3c;
            margin-bottom: 20px;
            font-weight: bold;
          }
          .login-button {
            display: inline-block;
            background-color: #388e3c;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 4px;
            font-weight: bold;
            margin: 20px 0;
            transition: background-color 0.3s ease;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .login-button:hover {
            background-color: #66bb6a;
          }
          .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 14px;
            border-top: 1px solid #EEE;
          }
          .divider {
            height: 2px;
            background: linear-gradient(to right, #388e3c, #66bb6a);
            margin: 20px 0;
          }
          .info-box {
            background-color: #f1f8e9;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
            border-left: 4px solid #388e3c;
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <h1>Sei stato aggiunto a un'azienda</h1>
          </div>
          
          <div class="content">
            <p class="welcome-text">Gentile ${name},</p>
            <p>Sei stato aggiunto da <strong>${invitedBy}</strong> all'azienda <strong>${companyName}</strong> su Seminai con il ruolo di <strong>${role}</strong>.</p>
            
            <div class="divider"></div>
            
            <div class="info-box">
              <p style="margin: 0;"><strong>Azienda:</strong> ${companyName}</p>
              <p style="margin: 10px 0 0 0;"><strong>Ruolo:</strong> ${role}</p>
            </div>
            
            <p>Puoi ora accedere a Seminai e iniziare a collaborare con il team dell'azienda.</p>
            
            <div style="text-align: center;">
              <a href="${loginLink}" class="login-button">
                Accedi a Seminai
              </a>
            </div>
            
            <div class="divider"></div>
            
            <p>Se hai ricevuto questa email per errore, ti preghiamo di contattarci.</p>
          </div>
          
          <div class="footer">
            <p>© ${new Date().getFullYear()} Seminai. Tutti i diritti riservati.</p>
            <p style="color: #388e3c; font-weight: bold; margin: 10px 0;">L'intelligenza artificiale al servizio dell'agricoltura</p>
            <small>Questa è un'email automatica, ti preghiamo di non rispondere.</small>
          </div>
        </div>
      </body>
      </html>
    `;
    const textContent = `
      Sei stato aggiunto a un'azienda
      
      Gentile ${name},
      
      Sei stato aggiunto da ${invitedBy} all'azienda ${companyName} su Seminai con il ruolo di ${role}.
      
      Azienda: ${companyName}
      Ruolo: ${role}
      
      Puoi ora accedere a Seminai e iniziare a collaborare con il team dell'azienda.
      
      Per accedere, visita: ${loginLink}
      
      Se hai ricevuto questa email per errore, ti preghiamo di contattarci.
      
      © ${new Date().getFullYear()} Seminai.
      L'intelligenza artificiale al servizio dell'agricoltura
    `;
    await this.sendEmail(
      email,
      `Sei stato aggiunto all'azienda ${companyName}`,
      textContent,
      htmlContent,
    );
  }

  async sendWorkspaceInvitationEmail(
    email: string,
    name: string,
    invitedBy: string,
    workspaceName: string,
    invitationToken?: string,
  ): Promise<void> {
    const acceptLink = invitationToken
      ? `${process.env.FRONTEND_URL}/workspace/accept-invitation?token=${invitationToken}`
      : `${process.env.FRONTEND_URL}/auth`;
    const loginLink = `${process.env.FRONTEND_URL}/auth`;
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #2C3E50;
            background-color: #F9F9F9;
            margin: 0;
            padding: 0;
          }
          .email-container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #FFFFFF;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .header {
            background-color: #388e3c;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 8px 8px 0 0;
            background-image: linear-gradient(45deg, #388e3c, #66bb6a);
          }
          .content {
            padding: 30px;
            background-color: white;
          }
          h1 {
            color: #FFFFFF;
            margin: 0;
            font-size: 24px;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.2);
          }
          .welcome-text {
            font-size: 18px;
            color: #388e3c;
            margin-bottom: 20px;
            font-weight: bold;
          }
          .accept-button {
            display: inline-block;
            background-color: #388e3c;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 4px;
            font-weight: bold;
            margin: 20px 0;
            transition: background-color 0.3s ease;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .accept-button:hover {
            background-color: #66bb6a;
          }
          .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 14px;
            border-top: 1px solid #EEE;
          }
          .divider {
            height: 2px;
            background: linear-gradient(to right, #388e3c, #66bb6a);
            margin: 20px 0;
          }
          .info-box {
            background-color: #f1f8e9;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
            border-left: 4px solid #388e3c;
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <h1>Invito al Workspace</h1>
          </div>
          
          <div class="content">
            <p class="welcome-text">Gentile ${name},</p>
            <p>Sei stato invitato da <strong>${invitedBy}</strong> ad unirti al workspace <strong>${workspaceName}</strong> su Seminai.</p>
            
            <div class="divider"></div>
            
            <div class="info-box">
              <p>${invitationToken ? "Clicca il pulsante qui sotto per accettare l'invito e accedere al workspace." : 'Puoi accedere al workspace utilizzando le tue credenziali esistenti.'}</p>
            </div>
            
            <div style="text-align: center;">
              <a href="${acceptLink}" class="accept-button">
                ${invitationToken ? 'Accetta Invito' : 'Accedi a Seminai'}
              </a>
            </div>
            
            ${invitationToken ? `<p style="font-size: 12px; color: #666; text-align: center;">Oppure puoi accedere direttamente su <a href="${loginLink}">Seminai</a> e accettare l'invito dalla sezione notifiche.</p>` : ''}
            
            <div class="divider"></div>
            
            <p>Se hai ricevuto questa email per errore, ti preghiamo di ignorarla.</p>
          </div>
          
          <div class="footer">
            <p>© ${new Date().getFullYear()} Seminai. Tutti i diritti riservati.</p>
            <p style="color: #388e3c; font-weight: bold; margin: 10px 0;">L'intelligenza artificiale al servizio dell'agricoltura</p>
            <small>Questa è un'email automatica, ti preghiamo di non rispondere.</small>
          </div>
        </div>
      </body>
      </html>
    `;
    const textContent = `
      Invito al Workspace
      
      Gentile ${name},
      
      Sei stato invitato da ${invitedBy} ad unirti al workspace ${workspaceName} su Seminai.
      
      ${invitationToken ? "Per accettare l'invito, visita: " + acceptLink : 'Puoi accedere al workspace utilizzando le tue credenziali esistenti.'}
      
      ${invitationToken ? 'Oppure accedi su ' + loginLink + " e accetta l'invito dalla sezione notifiche." : 'Per accedere, visita: ' + loginLink}
      
      Se hai ricevuto questa email per errore, ti preghiamo di ignorarla.
      
      © ${new Date().getFullYear()} Seminai.
      L'intelligenza artificiale al servizio dell'agricoltura
    `;
    await this.sendEmail(
      email,
      'Sei stato invitato a un workspace su Seminai',
      textContent,
      htmlContent,
    );
  }

  async sendTestEmail(email: string): Promise<void> {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Test Email da Seminai</h2>
          <p>Questa è un'email di test per verificare la configurazione SMTP.</p>
          <p>Se hai ricevuto questo messaggio, la configurazione è corretta! ✅</p>
        </div>
      </body>
      </html>
    `;
    const textContent =
      'Test email da Seminai - Se hai ricevuto questo messaggio, la configurazione è corretta!';
    await this.sendEmail(email, 'Test Email da Seminai', textContent, htmlContent);
  }
}
