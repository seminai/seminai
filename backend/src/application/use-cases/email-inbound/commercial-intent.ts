/** Subject keywords that signal a commercial (customer order) email. */
const ORDER_SUBJECT_KEYWORDS = [
  'ordine',
  'order',
  'acquisto',
  'purchase',
  'preventivo',
  'quote',
  'proforma',
];

/**
 * Lightweight rules classifier: an email is a commercial order when its subject
 * mentions an order/quote OR it carries a spreadsheet attachment (the order template).
 * Supplier invoices/DDT (PDF, no order keyword) stay on the warehouse path.
 */
export function isCommercialOrderEmail(input: {
  readonly subject?: string | null;
  readonly attachmentNames: ReadonlyArray<string>;
}): boolean {
  const subject = (input.subject ?? '').toLowerCase();
  if (ORDER_SUBJECT_KEYWORDS.some((keyword) => subject.includes(keyword))) return true;
  return input.attachmentNames.some((name) => {
    const lower = name.toLowerCase();
    return lower.endsWith('.xlsx') || lower.endsWith('.xls');
  });
}
