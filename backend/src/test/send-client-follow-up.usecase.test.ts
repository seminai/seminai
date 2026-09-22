import { BusinessPartner } from '../domain/entities/BusinessPartner';
import { IBusinessPartnerRepository } from '../domain/repositories/IBusinessPartnerRepository';
import { ICompanyRepository } from '../domain/repositories/ICompanyRepository';
import { SendClientFollowUpUseCase } from '../application/use-cases/client-follow-up/SendClientFollowUpUseCase';

function partner(overrides: Partial<BusinessPartner>): BusinessPartner {
  return {
    id: 'p1',
    companyId: 'c1',
    name: 'Cantina Rossi',
    email: 'cliente@vino.it',
    ...overrides,
  } as unknown as BusinessPartner;
}

function companyRepo(): ICompanyRepository {
  return {
    findById: jest.fn().mockResolvedValue({ name: 'Azienda Mia' }),
  } as unknown as ICompanyRepository;
}

describe('SendClientFollowUpUseCase', () => {
  it('skips (no send, no stamp) when the partner has no email', async () => {
    const update = jest.fn();
    const sendRawEmail = jest.fn();
    const repo = { update } as unknown as IBusinessPartnerRepository;

    const result = await new SendClientFollowUpUseCase(companyRepo(), repo, {
      sendRawEmail,
    }).execute(partner({ email: null }));

    expect(result.sent).toBe(false);
    expect(sendRawEmail).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('sends the reminder to the customer and stamps followUpLastSentAt', async () => {
    const update = jest.fn();
    const sendRawEmail = jest.fn();
    const repo = { update } as unknown as IBusinessPartnerRepository;

    const result = await new SendClientFollowUpUseCase(companyRepo(), repo, {
      sendRawEmail,
    }).execute(partner({}));

    expect(result.sent).toBe(true);
    expect(sendRawEmail).toHaveBeenCalledTimes(1);
    expect(sendRawEmail.mock.calls[0][0].to).toBe('cliente@vino.it');
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toBe('p1');
    expect(update.mock.calls[0][1].followUpLastSentAt).toBeInstanceOf(Date);
  });
});
