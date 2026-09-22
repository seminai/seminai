import { buildCompanyArchiveLink } from '../utils/frontend-links';
import type { EmailServiceContext } from './email-service.context';

export async function emailServiceSendUserAddedToCompanyEmail(this: EmailServiceContext, email: string, name: string, companyId: string, companyName: string, invitedBy: string, role: string): Promise<void> {
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
