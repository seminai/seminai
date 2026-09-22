import { EmailIngestionStatus } from '@prisma/client';
import { EmailIngestion } from '../domain/entities/EmailIngestion';
import { BusinessPartner } from '../domain/entities/BusinessPartner';
import { ISalesOrderRepository, SalesOrderWithItems } from '../domain/repositories/ISalesOrderRepository';
import { IDeliveryNoteRepository, DeliveryNoteWithItems } from '../domain/repositories/IDeliveryNoteRepository';
import { IEmailIngestionRepository } from '../domain/repositories/IEmailIngestionRepository';
import { IBusinessPartnerRepository } from '../domain/repositories/IBusinessPartnerRepository';
import { IProformaInvoiceRepository } from '../domain/repositories/IProformaInvoiceRepository';
import { ISalesInvoiceRepository, SalesInvoiceWithItems } from '../domain/repositories/ISalesInvoiceRepository';
import { GetCommercialInboxUseCase } from '../application/use-cases/commercial/GetCommercialInboxUseCase';

const COMPANY_ID = 'company-1';
const NOW = new Date('2026-06-21T12:00:00.000Z');
const DAY_MS = 86_400_000;

function salesOrderRepoMock(orders: SalesOrderWithItems[]): ISalesOrderRepository {
  return {
    findManyByCompany: jest.fn().mockResolvedValue(orders),
  } as unknown as ISalesOrderRepository;
}

function ddtRepoMock(ddts: DeliveryNoteWithItems[]): IDeliveryNoteRepository {
  return {
    findManyByCompany: jest.fn().mockResolvedValue(ddts),
  } as unknown as IDeliveryNoteRepository;
}

function emailRepoMock(
  awaiting: EmailIngestion[],
  dispatched: EmailIngestion[],
): IEmailIngestionRepository {
  return {
    findManyByCompany: jest
      .fn()
      .mockImplementation(async (query) =>
        query.statuses.includes(EmailIngestionStatus.AWAITING_DISAMBIGUATION)
          ? awaiting
          : dispatched,
      ),
  } as unknown as IEmailIngestionRepository;
}

function partnerRepoMock(partners: BusinessPartner[]): IBusinessPartnerRepository {
  return {
    findManyByCompany: jest.fn().mockResolvedValue(partners),
  } as unknown as IBusinessPartnerRepository;
}

function proformaRepoMock(orderIds: string[]): IProformaInvoiceRepository {
  return {
    findOrderIdsByCompany: jest.fn().mockResolvedValue(orderIds),
  } as unknown as IProformaInvoiceRepository;
}

function salesInvoiceRepoMock(overdue: SalesInvoiceWithItems[] = []): ISalesInvoiceRepository {
  return {
    findById: jest.fn(),
    findManyByCompany: jest.fn().mockResolvedValue([]),
    findOverdueByCompany: jest.fn().mockResolvedValue(overdue),
    markReminderSent: jest.fn(),
    markPaid: jest.fn(),
  } as unknown as ISalesInvoiceRepository;
}
describe('GetCommercialInboxUseCase', () => {

  it('queries AWAITING emails without a time window and DISPATCHED within a 7-day window', async () => {
    const emailRepo = emailRepoMock([], []);
    const useCase = new GetCommercialInboxUseCase(
      salesOrderRepoMock([]),
      ddtRepoMock([]),
      emailRepo,
      partnerRepoMock([]),
      proformaRepoMock([]),
      salesInvoiceRepoMock(),
    );

    await useCase.execute({ companyId: COMPANY_ID, now: NOW });
    const calls = (emailRepo.findManyByCompany as jest.Mock).mock.calls.map(([query]) => query);
    const awaitingCall = calls.find((q) =>
      q.statuses.includes(EmailIngestionStatus.AWAITING_DISAMBIGUATION),
    );
    const dispatchedCall = calls.find((q) => q.statuses.includes(EmailIngestionStatus.DISPATCHED));

    expect(awaitingCall?.since).toBeUndefined();
    expect(dispatchedCall?.since).toEqual(new Date(NOW.getTime() - 7 * DAY_MS));
  });});
