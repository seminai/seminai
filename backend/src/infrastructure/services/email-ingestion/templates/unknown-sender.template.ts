interface BuiltEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/**
 * Builds the reply sent when the inbound sender is not recognised
 * (no User row matches the From address) or has no companies associated.
 */
export function buildUnknownSenderEmail(): BuiltEmail {
  const subject = 'Seminai — indirizzo non riconosciuto';
  const text = [
    'Ciao,',
    '',
    "Abbiamo ricevuto una tua email all'indirizzo di Seminai, ma non abbiamo trovato",
    "un account associato a questo indirizzo (o l'account non ha aziende collegate).",
    '',
    'Per usare il connettore email:',
    '1. Registrati su https://app.seminai.app',
    '2. Verifica che la tua email sia confermata',
    "3. Associa il tuo account a un'azienda agricola",
    '',
    'Poi potrai inviare documenti agli allegati direttamente dalla tua email.',
    '',
    'Grazie,',
    'Seminai',
  ].join('\n');
  const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">
  <h2 style="color: #388e3c; margin-bottom: 16px;">Indirizzo non riconosciuto</h2>
  <p>Ciao,</p>
  <p>Abbiamo ricevuto una tua email all'indirizzo di Seminai, ma non abbiamo trovato un account associato a questo indirizzo (o l'account non ha aziende collegate).</p>
  <p><strong>Per usare il connettore email:</strong></p>
  <ol>
    <li>Registrati su <a href="https://app.seminai.app">app.seminai.app</a></li>
    <li>Verifica che la tua email sia confermata</li>
    <li>Associa il tuo account a un'azienda agricola</li>
  </ol>
  <p>Poi potrai inviare documenti come allegati direttamente dalla tua email.</p>
  <p style="margin-top: 24px;">Grazie,<br/>Seminai</p>
</div>`.trim();
  return { subject, text, html };
}
