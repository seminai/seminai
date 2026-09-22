import type { EmailServiceContext } from './email-service.context';

export async function emailServiceSendWelcomeEmail(this: EmailServiceContext, email: string, name: string, token: string): Promise<void> {
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
