interface BuildInput {
  readonly userName: string;
  readonly companyName: string;
  readonly originalSubject: string;
  readonly attachmentNames: ReadonlyArray<string>;
  readonly threadId: string;
}

interface BuiltEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

const DEFAULT_CHAT_URL_TEMPLATE = 'https://app.seminai.app/chat/{threadId}';

function resolveChatUrl(threadId: string): string {
  const template = process.env.EMAIL_INGEST_FRONTEND_CHAT_URL_TEMPLATE ?? DEFAULT_CHAT_URL_TEMPLATE;
  return template.replace('{threadId}', encodeURIComponent(threadId));
}

/**
 * Builds the post-dispatch riepilogo sent to the user after the agent
 * starts processing. Includes a deep link to the chat for approval.
 */
export function buildIngestionConfirmationEmail(input: BuildInput): BuiltEmail {
  const chatUrl = resolveChatUrl(input.threadId);
  const subject = `Re: ${input.originalSubject}`;
  const attachmentLines =
    input.attachmentNames.length > 0
      ? input.attachmentNames.map((name) => `- ${name}`).join('\n')
      : '(nessun allegato)';
  const text = [
    `Ciao ${input.userName},`,
    '',
    `Abbiamo ricevuto la tua email e stiamo elaborando i documenti per l'azienda "${input.companyName}".`,
    '',
    'Allegati ricevuti:',
    attachmentLines,
    '',
    `Apri la chat per rivedere l'estrazione e confermare le azioni proposte:`,
    chatUrl,
    '',
    "L'AI ha bisogno della tua conferma prima di salvare i dati nell'azienda.",
    '',
    'Grazie,',
    'Seminai',
  ].join('\n');
  const html = renderHtml({
    userName: input.userName,
    companyName: input.companyName,
    attachmentNames: input.attachmentNames,
    chatUrl,
  });
  return { subject, text, html };
}

function renderHtml(input: {
  userName: string;
  companyName: string;
  attachmentNames: ReadonlyArray<string>;
  chatUrl: string;
}): string {
  const items =
    input.attachmentNames.length > 0
      ? `<ul>${input.attachmentNames.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`
      : '<p style="color:#6b7280; font-style:italic;">(nessun allegato)</p>';
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">
  <h2 style="color: #388e3c; margin-bottom: 16px;">Email ricevuta — l'AI sta elaborando</h2>
  <p>Ciao <strong>${escapeHtml(input.userName)}</strong>,</p>
  <p>Abbiamo ricevuto la tua email e stiamo elaborando i documenti per l'azienda <strong>${escapeHtml(input.companyName)}</strong>.</p>
  <p><strong>Allegati ricevuti:</strong></p>
  ${items}
  <p style="margin-top: 24px;">
    <a href="${input.chatUrl}" style="display: inline-block; background: #388e3c; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Apri la chat e conferma</a>
  </p>
  <p style="font-size: 14px; color: #6b7280;">L'AI ha bisogno della tua conferma prima di salvare i dati nell'azienda.</p>
  <p style="margin-top: 24px;">Grazie,<br/>Seminai</p>
</div>`.trim();
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
