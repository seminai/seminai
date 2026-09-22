interface BuildInput {
  readonly companyName: string;
  readonly partnerName: string;
  readonly invoiceNumber: string; // e.g. "3/2026"
  readonly dueDate: Date;
  readonly amount: number;
}

interface BuiltEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatAmount(amount: number): string {
  return `€ ${amount.toFixed(2)}`;
}

/**
 * Builds a courteous payment reminder for an overdue invoice. Sent on demand
 * (inbox one-click); includes the invoice number, amount and original due date.
 */
export function buildPaymentReminderEmail(input: BuildInput): BuiltEmail {
  const due = formatDate(input.dueDate);
  const amount = formatAmount(input.amount);
  const subject = `Sollecito pagamento fattura ${input.invoiceNumber} — ${input.companyName}`;
  const text = [
    `Buongiorno ${input.partnerName},`,
    '',
    `le ricordiamo che la fattura ${input.invoiceNumber} di ${amount}, con scadenza ${due}, risulta ancora da saldare.`,
    '',
    'La preghiamo di provvedere al pagamento. Se ha già pagato, ci scusi e ignori questo messaggio.',
    '',
    'Grazie,',
    input.companyName,
  ].join('\n');
  const html = renderHtml({ ...input, due, amount });
  return { subject, text, html };
}

function renderHtml(input: {
  companyName: string;
  partnerName: string;
  invoiceNumber: string;
  due: string;
  amount: string;
}): string {
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">
  <h2 style="color: #b45309; margin-bottom: 16px;">Sollecito di pagamento</h2>
  <p>Buongiorno <strong>${escapeHtml(input.partnerName)}</strong>,</p>
  <p>le ricordiamo che la fattura <strong>${escapeHtml(input.invoiceNumber)}</strong> di
     <strong>${escapeHtml(input.amount)}</strong>, con scadenza <strong>${escapeHtml(input.due)}</strong>,
     risulta ancora da saldare.</p>
  <p>La preghiamo di provvedere al pagamento. Se ha già pagato, ci scusi e ignori questo messaggio.</p>
  <p style="margin-top: 24px;">Grazie,<br/>${escapeHtml(input.companyName)}</p>
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
