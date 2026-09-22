import { ISalesInvoiceRepository } from '../domain/repositories/ISalesInvoiceRepository';
import { IBusinessPartnerRepository } from '../domain/repositories/IBusinessPartnerRepository';
import { ICompanyRepository } from '../domain/repositories/ICompanyRepository';
import { SendPaymentReminderEmailUseCase } from '../application/use-cases/sales-invoice/SendPaymentReminderEmailUseCase';

function invoiceEntry() {
  return {
    salesInvoice: {
      id: 'inv-1',
      companyId: 'c1',
      partnerId: 'p1',
      label: '1/2026',
      dueDate: new Date('2026-06-01T00:00:00.000Z'),
      totalAmount: 100,
    },
    items: [],
  };
}

function invoiceRepo(entry: unknown, markReminderSent = jest.fn()): ISalesInvoiceRepository {
  return {
    findById: jest.fn().mockResolvedValue(entry),
    markReminderSent,
  } as unknown as ISalesInvoiceRepository;
}

function partnerRepo(email: string | null): IBusinessPartnerRepository {
  return {
    findById: jest.fn().mockResolvedValue({ name: 'Cliente Rossi', email }),
  } as unknown as IBusinessPartnerRepository;
}

function companyRepo(): ICompanyRepository {
  return {
    findById: jest.fn().mockResolvedValue({ name: 'Azienda Mia' }),
  } as unknown as ICompanyRepository;
}

describe('SendPaymentReminderEmailUseCase', () => {
  it('throws INVOICE_NOT_FOUND when the invoice does not exist', async () => {
    const useCase = new SendPaymentReminderEmailUseCase(
      invoiceRepo(null),
      partnerRepo('x@y.it'),
      companyRepo(),
      { sendRawEmail: jest.fn() },
    );
    await expect(useCase.execute('missing')).rejects.toMatchObject({ code: 'INVOICE_NOT_FOUND' });
  });

  it('throws PARTNER_NO_EMAIL and does not send when the customer has no email', async () => {
    const markReminderSent = jest.fn();
    const sendRawEmail = jest.fn();
    const useCase = new SendPaymentReminderEmailUseCase(
      invoiceRepo(invoiceEntry(), markReminderSent),
      partnerRepo(null),
      companyRepo(),
      { sendRawEmail },
    );
    await expect(useCase.execute('inv-1')).rejects.toMatchObject({ code: 'PARTNER_NO_EMAIL' });
    expect(sendRawEmail).not.toHaveBeenCalled();
    expect(markReminderSent).not.toHaveBeenCalled();
  });

  it('sends the reminder to the customer and stamps lastReminderAt', async () => {
    const markReminderSent = jest.fn();
    const sendRawEmail = jest.fn();
    const useCase = new SendPaymentReminderEmailUseCase(
      invoiceRepo(invoiceEntry(), markReminderSent),
      partnerRepo('cliente@vino.it'),
      companyRepo(),
      { sendRawEmail },
    );

    const result = await useCase.execute('inv-1');

    expect(result.sent).toBe(true);
    expect(sendRawEmail).toHaveBeenCalledTimes(1);
    expect(sendRawEmail.mock.calls[0][0].to).toBe('cliente@vino.it');
    expect(markReminderSent).toHaveBeenCalledWith('inv-1', expect.any(Date));
  });
});
