import { type DisambiguationCandidateDto } from '../../../../domain/dtos/email-inbound.dto';

interface BuildInput {
  readonly userName: string;
  readonly originalSubject: string;
  readonly candidates: ReadonlyArray<DisambiguationCandidateDto>;
  readonly token: string;
}

interface BuiltEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/**
 * Builds the email asking the user to pick which company the inbound
 * attachments should be associated to.
 */
export function buildDisambiguationRequestEmail(input: BuildInput): BuiltEmail {
  const subject = `Re: ${input.originalSubject} [${input.token}]`;
  const list = input.candidates.map((c) => `${c.index}) ${c.companyName}`).join('\n');
  const text = [
    `Ciao ${input.userName},`,
    '',
    'Abbiamo ricevuto la tua email con allegati, ma sei associato a più aziende.',
    "Rispondi a questa email indicando il numero corrispondente all'azienda di riferimento.",
    '',
    list,
    '',
    'Esempio di risposta: AZIENDA: 2',
    '',
    "Importante: non rimuovere l'identificatore tra parentesi quadre nel subject.",
    '',
    'Grazie,',
    'Seminai',
  ].join('\n');
  const html = renderHtml({ userName: input.userName, candidates: input.candidates });
  return { subject, text, html };
}

function renderHtml(input: {
  userName: string;
  candidates: ReadonlyArray<DisambiguationCandidateDto>;
}): string {
  const items = input.candidates
    .map((c) => `<li><strong>${c.index})</strong> ${escapeHtml(c.companyName)}</li>`)
    .join('');
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">
  <h2 style="color: #388e3c; margin-bottom: 16px;">Seleziona l'azienda di riferimento</h2>
  <p>Ciao <strong>${escapeHtml(input.userName)}</strong>,</p>
  <p>Abbiamo ricevuto la tua email con allegati, ma il tuo account è associato a più aziende.</p>
  <p>Rispondi a questa email indicando il numero corrispondente all'azienda di riferimento.</p>
  <ol style="background:#f3f4f6; padding:16px 24px; border-radius:8px;">${items}</ol>
  <p style="font-size: 14px; color: #6b7280;">Esempio di risposta: <code>AZIENDA: 2</code></p>
  <p style="font-size: 13px; color: #9ca3af;">Importante: non rimuovere l'identificatore tra parentesi quadre nel subject — è necessario per associare la tua risposta.</p>
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
