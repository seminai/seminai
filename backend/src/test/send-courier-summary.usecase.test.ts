import { IDeliveryNoteRepository } from '../domain/repositories/IDeliveryNoteRepository';
import { ICompanyRepository } from '../domain/repositories/ICompanyRepository';
import {
  SendCourierSummaryEmailUseCase,
  EmailSender,
} from '../application/use-cases/delivery-note/SendCourierSummaryEmailUseCase';

function ddtEntry(id: string, recipient: string) {
  return {
    deliveryNote: {
      id,
      ddtDate: new Date('2026-06-25T09:00:00.000Z'),
      carrier: 'BRT',
      packagesCount: 2,
      estimatedWeightKg: 10,
      customerSnapshot: { name: recipient },
    },
    items: [],
  };
}

function ddtRepo(entries: unknown[], markSent = jest.fn()): IDeliveryNoteRepository {
  return {
    findManyByCompany: jest.fn().mockResolvedValue(entries),
    markSent,
  } as unknown as IDeliveryNoteRepository;
}

function companyRepo(courierEmail: string | null): ICompanyRepository {
  return {
    getCourierEmail: jest.fn().mockResolvedValue(courierEmail),
    findById: jest.fn().mockResolvedValue({ name: 'Cantina Test' }),
  } as unknown as ICompanyRepository;
}

describe('SendCourierSummaryEmailUseCase', () => {
  it('throws COURIER_EMAIL_NOT_SET when no courier email is configured', async () => {
    const email: EmailSender = { sendRawEmail: jest.fn() };
    const useCase = new SendCourierSummaryEmailUseCase(
      ddtRepo([ddtEntry('a', 'Rossi')]),
      companyRepo(null),
      email,
    );
    await expect(useCase.execute('company-1')).rejects.toMatchObject({
      code: 'COURIER_EMAIL_NOT_SET',
    });
    expect(email.sendRawEmail).not.toHaveBeenCalled();
  });

  it('sends one email to the courier and marks each DDT sent', async () => {
    const markSent = jest.fn();
    const sendRawEmail = jest.fn();
    const useCase = new SendCourierSummaryEmailUseCase(
      ddtRepo([ddtEntry('a', 'Rossi'), ddtEntry('b', 'Bianchi')], markSent),
      companyRepo('corriere@vino.it'),
      { sendRawEmail },
    );

    const result = await useCase.execute('company-1');

    expect(sendRawEmail).toHaveBeenCalledTimes(1);
    expect(sendRawEmail.mock.calls[0][0].to).toBe('corriere@vino.it');
    expect(markSent).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ sent: 2, recipients: 2, courierEmail: 'corriere@vino.it' });
  });

  it('returns sent:0 and does not email when there are no GENERATED DDTs', async () => {
    const sendRawEmail = jest.fn();
    const useCase = new SendCourierSummaryEmailUseCase(
      ddtRepo([]),
      companyRepo('corriere@vino.it'),
      {
        sendRawEmail,
      },
    );

    const result = await useCase.execute('company-1');

    expect(result.sent).toBe(0);
    expect(sendRawEmail).not.toHaveBeenCalled();
  });
});
