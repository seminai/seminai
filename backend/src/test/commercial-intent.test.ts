import { isCommercialOrderEmail } from '../application/use-cases/email-inbound/commercial-intent';

describe('isCommercialOrderEmail', () => {
  it('is commercial when the subject mentions an order/quote', () => {
    expect(
      isCommercialOrderEmail({ subject: 'Nuovo ordine vini', attachmentNames: ['note.pdf'] }),
    ).toBe(true);
    expect(isCommercialOrderEmail({ subject: 'Richiesta preventivo', attachmentNames: [] })).toBe(
      true,
    );
  });

  it('is commercial when an .xlsx/.xls attachment is present', () => {
    expect(isCommercialOrderEmail({ subject: 'ciao', attachmentNames: ['modello.xlsx'] })).toBe(
      true,
    );
    expect(isCommercialOrderEmail({ subject: '', attachmentNames: ['ORDINE.XLS'] })).toBe(true);
  });

  it('is NOT commercial for a supplier invoice PDF with no order keyword', () => {
    expect(
      isCommercialOrderEmail({
        subject: 'Fattura fornitore n.42',
        attachmentNames: ['fattura.pdf'],
      }),
    ).toBe(false);
  });

  it('handles a null subject', () => {
    expect(isCommercialOrderEmail({ subject: null, attachmentNames: ['ddt.pdf'] })).toBe(false);
  });
});
