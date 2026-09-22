interface BuiltEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

const SETTINGS_URL = 'https://app.seminai.app/settings?section=integrations';

/**
 * Builds the reply sent when the sender is a known Seminai user but
 * has not enabled email ingestion in their Settings (opt-in default).
 */
export function buildOptOutEmail(): BuiltEmail {
  const subject = 'Seminai — integrazione email non attiva';
  const text = [
    'Ciao,',
    '',
    "Abbiamo ricevuto la tua email ma l'integrazione email non e' attiva sul tuo account.",
    '',
    'Per attivarla:',
    `1. Apri le impostazioni: ${SETTINGS_URL}`,
    '2. Vai alla sezione "Integrazioni"',
    '3. Attiva il toggle "Email"',
    '',
    'Una volta attivata, potrai inviare allegati direttamente dalla tua email',
    "e il sistema li elaborera' automaticamente.",
    '',
    'Grazie,',
    'Seminai',
  ].join('\n');
  const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">
  <h2 style="color: #388e3c; margin-bottom: 16px;">Integrazione email non attiva</h2>
  <p>Ciao,</p>
  <p>Abbiamo ricevuto la tua email ma l'integrazione email non &egrave; attiva sul tuo account Seminai.</p>
  <p><strong>Per attivarla:</strong></p>
  <ol>
    <li>Apri <a href="${SETTINGS_URL}">le impostazioni</a></li>
    <li>Vai alla sezione "Integrazioni"</li>
    <li>Attiva il toggle "Email"</li>
  </ol>
  <p style="margin-top: 24px;">
    <a href="${SETTINGS_URL}" style="display: inline-block; background: #388e3c; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Apri impostazioni</a>
  </p>
  <p style="font-size: 14px; color: #6b7280;">Una volta attivata, potrai inviare allegati direttamente dalla tua email e il sistema li elaborer&agrave; automaticamente.</p>
  <p style="margin-top: 24px;">Grazie,<br/>Seminai</p>
</div>`.trim();
  return { subject, text, html };
}
