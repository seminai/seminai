import type { EmailServiceContext } from './email-service.context';

export async function emailServiceSendPasswordResetEmail(this: EmailServiceContext, email: string, name: string, token: string): Promise<void> {
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
