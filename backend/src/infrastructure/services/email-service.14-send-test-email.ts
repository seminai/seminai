import type { EmailServiceContext } from './email-service.context';

export async function emailServiceSendTestEmail(this: EmailServiceContext, email: string): Promise<void> {
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
