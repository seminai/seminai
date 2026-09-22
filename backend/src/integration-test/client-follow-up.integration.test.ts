import { PartnerType } from '@prisma/client';
import { prisma, cleanupTestData } from './setup';
import {
  createTestUser,
  createTestCompany,
  deleteTestUser,
  deleteTestCompany,
  deleteAllTestCompanies,
} from './helpers';
import { BusinessPartner } from '../domain/entities/BusinessPartner';
import { PrismaBusinessPartnerRepository } from '../infrastructure/repositories/PrismaBusinessPartnerRepository';
import { PrismaCompanyRepository } from '../infrastructure/repositories/PrismaCompanyRepository';
import { SendClientFollowUpUseCase } from '../application/use-cases/client-follow-up/SendClientFollowUpUseCase';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

describe('Client Follow-Up Integration Tests', () => {
  const partnerRepo = new PrismaBusinessPartnerRepository(prisma);
  const companyRepo = new PrismaCompanyRepository(prisma);

  let userId: string;
  let companyId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id!;
  });

  beforeEach(async () => {
    await deleteAllTestCompanies(userId);
    const company = await createTestCompany({ userId });
    companyId = company.id!;
  });

  afterAll(async () => {
    await deleteTestCompany(companyId);
    await deleteTestUser();
    await cleanupTestData();
  });

  async function createCustomer(input: {
    name: string;
    email: string | null;
    enabled: boolean;
  }): Promise<BusinessPartner> {
    const created = await partnerRepo.create(
      BusinessPartner.create({
        companyId,
        type: PartnerType.CUSTOMER,
        name: input.name,
        email: input.email,
      }),
    );
    if (input.enabled) await partnerRepo.update(created.id, { followUpEnabled: true });
    return (await partnerRepo.findById(created.id))!;
  }

  it('selects only enabled customers with an email, then stamps them after sending', async () => {
    await createCustomer({ name: 'Abilitato', email: 'abilitato@vino.it', enabled: true });
    await createCustomer({ name: 'Disabilitato', email: 'disab@vino.it', enabled: false });
    await createCustomer({ name: 'SenzaEmail', email: null, enabled: true });

    // findDueForFollowUp is global (the cron sweeps all companies); scope to this test's company.
    const due = (await partnerRepo.findDueForFollowUp(new Date())).filter(
      (partner) => partner.companyId === companyId,
    );
    expect(due.map((partner) => partner.name)).toEqual(['Abilitato']);

    const sendRawEmail = jest.fn();
    const result = await new SendClientFollowUpUseCase(companyRepo, partnerRepo, {
      sendRawEmail,
    }).execute(due[0]);

    expect(result.sent).toBe(true);
    expect(sendRawEmail).toHaveBeenCalledTimes(1);
    expect(sendRawEmail.mock.calls[0][0].to).toBe('abilitato@vino.it');
    const reloaded = await partnerRepo.findById(due[0].id);
    expect(reloaded?.followUpLastSentAt).toBeInstanceOf(Date);
  });

  it('does not re-select a customer reminded within the last 7 days', async () => {
    const customer = await createCustomer({
      name: 'Recente',
      email: 'recente@vino.it',
      enabled: true,
    });
    await partnerRepo.update(customer.id, {
      followUpLastSentAt: new Date(Date.now() - 2 * 86400000),
    });

    const due = await partnerRepo.findDueForFollowUp(new Date(Date.now() - WEEK_MS));

    expect(due.find((partner) => partner.id === customer.id)).toBeUndefined();
  });
});
