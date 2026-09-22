import { PartnerType } from '@prisma/client';
import { BusinessPartner } from '../domain/entities/BusinessPartner';
import { IBusinessPartnerRepository } from '../domain/repositories/IBusinessPartnerRepository';
import { CreateOrUpdatePartnerFromExtractionUseCase } from '../application/use-cases/business-partner/CreateOrUpdatePartnerFromExtractionUseCase';

const COMPANY_ID = 'company-1';

function makeCustomer(
  overrides: Partial<Parameters<typeof BusinessPartner.create>[0]> = {},
): BusinessPartner {
  return BusinessPartner.create({
    companyId: COMPANY_ID,
    type: PartnerType.CUSTOMER,
    name: 'Cantina Cliente',
    vatNumber: '01234567890',
    ...overrides,
  });
}

function partnerRepo(existing: BusinessPartner | null): {
  repo: IBusinessPartnerRepository;
  create: jest.Mock;
  update: jest.Mock;
  findDuplicate: jest.Mock;
} {
  const create = jest.fn().mockImplementation(async (p: BusinessPartner) => p);
  const update = jest
    .fn()
    .mockImplementation(async (_id: string, data: Record<string, unknown>) =>
      makeCustomer(data as Partial<Parameters<typeof BusinessPartner.create>[0]>),
    );
  const findDuplicate = jest.fn().mockResolvedValue(existing);
  return {
    repo: { create, update, findDuplicate } as unknown as IBusinessPartnerRepository,
    create,
    update,
    findDuplicate,
  };
}

describe('CreateOrUpdatePartnerFromExtractionUseCase', () => {
  it('creates a new customer with a normalized VAT when no duplicate', async () => {
    const mocks = partnerRepo(null);
    const useCase = new CreateOrUpdatePartnerFromExtractionUseCase(mocks.repo);

    const result = await useCase.execute({
      companyId: COMPANY_ID,
      name: 'Nuovo Cliente',
      vatNumber: 'IT 012.345.678 90',
    });

    expect(result.reused).toBe(false);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(result.partner.vatNumber).toBe('01234567890'); // normalized
  });

  it('matches by IT-prefixed VAT against a bare stored VAT and reuses it', async () => {
    const existing = makeCustomer({ vatNumber: '01234567890', email: 'cliente@vino.it' });
    const mocks = partnerRepo(existing);
    const useCase = new CreateOrUpdatePartnerFromExtractionUseCase(mocks.repo);

    const result = await useCase.execute({
      companyId: COMPANY_ID,
      name: 'Cantina Cliente',
      vatNumber: 'IT01234567890',
    });

    // findDuplicate must be queried with the normalized VAT.
    expect(mocks.findDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({ vatNumber: '01234567890', type: PartnerType.CUSTOMER }),
    );
    expect(result.reused).toBe(true);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('enriches only the missing fields on a matched partner', async () => {
    const existing = makeCustomer({ email: null, city: 'Verona' });
    const mocks = partnerRepo(existing);
    const useCase = new CreateOrUpdatePartnerFromExtractionUseCase(mocks.repo);

    await useCase.execute({
      companyId: COMPANY_ID,
      name: 'Cantina Cliente',
      vatNumber: '01234567890',
      email: 'nuova@vino.it',
      city: 'Milano', // existing already has Verona → must NOT overwrite
    });

    expect(mocks.update).toHaveBeenCalledTimes(1);
    const patch = mocks.update.mock.calls[0][1];
    expect(patch).toEqual({ email: 'nuova@vino.it' }); // only the missing field
  });

  it('does not call update when the matched partner already has everything', async () => {
    const existing = makeCustomer({ email: 'già@vino.it' });
    const mocks = partnerRepo(existing);
    const useCase = new CreateOrUpdatePartnerFromExtractionUseCase(mocks.repo);

    await useCase.execute({
      companyId: COMPANY_ID,
      name: 'Cantina Cliente',
      vatNumber: '01234567890',
    });

    expect(mocks.update).not.toHaveBeenCalled();
  });
});
