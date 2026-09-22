interface BuildInput {
  readonly partnerName: string;
  readonly companyName: string;
}

interface BuiltEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/**
 * Builds the periodic order-collection reminder sent to a customer. The message
 * asks them to reply with their usual order; the reply lands in the company's
 * inbound→inbox pipeline. Includes a soft opt-out note (GDPR).
 */
export function buildClientFollowUpEmail(input: BuildInput): BuiltEmail {
  const subject = `${input.companyName} — vuole registrare un ordine?`;
  const text = [
    `Buongiorno ${input.partnerName},`,
    '',
    `siamo ${input.companyName}. Le scriviamo per ricordarle che può inviarci un nuovo ordine quando desidera.`,
    '',
    'Per ordinare, risponda a questa email indicando i prodotti e le quantità (può allegare il suo file ordine abituale).',
    '',
    'Grazie,',
    input.companyName,
    '',
    'Per non ricevere più questi promemoria, ce lo comunichi rispondendo a questa email.',
  ].join('\n');
  const html = renderHtml(input);
  return { subject, text, html };
}

function renderHtml(input: BuildInput): string {
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">
  <h2 style="color: #388e3c; margin-bottom: 16px;">Vuole registrare un ordine?</h2>
  <p>Buongiorno <strong>${escapeHtml(input.partnerName)}</strong>,</p>
  <p>siamo <strong>${escapeHtml(input.companyName)}</strong>. Le ricordiamo che può inviarci un nuovo ordine quando desidera.</p>
  <p>Per ordinare, <strong>risponda a questa email</strong> indicando i prodotti e le quantità — può anche allegare il suo file ordine abituale.</p>
  <p style="margin-top: 24px;">Grazie,<br/>${escapeHtml(input.companyName)}</p>
  <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">Per non ricevere più questi promemoria, ce lo comunichi rispondendo a questa email.</p>
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
