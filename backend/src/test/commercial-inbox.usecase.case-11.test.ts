import { EmailIngestionStatus } from '@prisma/client';
import { EmailIngestion } from '../domain/entities/EmailIngestion';
import { BusinessPartner } from '../domain/entities/BusinessPartner';
import { ISalesOrderRepository, SalesOrderWithItems } from '../domain/repositories/ISalesOrderRepository';
import { IDeliveryNoteRepository, DeliveryNoteWithItems } from '../domain/repositories/IDeliveryNoteRepository';
import { IEmailIngestionRepository } from '../domain/repositories/IEmailIngestionRepository';
import { IBusinessPartnerRepository } from '../domain/repositories/IBusinessPartnerRepository';
import { ISalesInvoiceRepository, SalesInvoiceWithItems } from '../domain/repositories/ISalesInvoiceRepository';
import { GetCommercialDeadlinesUseCase } from '../application/use-cases/commercial/GetCommercialDeadlinesUseCase';

const COMPANY_ID = 'company-1';
const NOW = new Date('2026-06-21T12:00:00.000Z');
const DAY_MS = 86_400_000;

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

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

function salesInvoiceRepoMock(overdue: SalesInvoiceWithItems[] = []): ISalesInvoiceRepository {
  return {
    findById: jest.fn(),
    findManyByCompany: jest.fn().mockResolvedValue([]),
    findOverdueByCompany: jest.fn().mockResolvedValue(overdue),
    markReminderSent: jest.fn(),
    markPaid: jest.fn(),
  } as unknown as ISalesInvoiceRepository;
}

/** Minimal overdue invoice entry for inbox/deadlines assertions. */
function makeOverdueInvoice(input: {
  id: string;
  totalAmount?: number;
  customerName?: string;
}): SalesInvoiceWithItems {
  return {
    salesInvoice: {
      id: input.id,
      companyId: COMPANY_ID,
      partnerId: 'partner-x',
      deliveryNoteId: null,
      number: 1,
      year: 2026,
      label: '1/2026',
      invoiceDate: daysAgo(40),
      dueDate: daysAgo(10),
      totalAmount: input.totalAmount ?? 100,
      causale: null,
      customerSnapshot: { name: input.customerName ?? 'Cliente X' },
      paidAt: null,
      lastReminderAt: null,
    },
    items: [],
  } as unknown as SalesInvoiceWithItems;
}
describe('GetCommercialDeadlinesUseCase', () => {

  it('counts overdue invoices from the sales-invoice repository', async () => {
    const useCase = new GetCommercialDeadlinesUseCase(
      salesOrderRepoMock([]),
      ddtRepoMock([]),
      emailRepoMock([], []),
      partnerRepoMock([]),
      salesInvoiceRepoMock([
        makeOverdueInvoice({ id: 'inv-1' }),
        makeOverdueInvoice({ id: 'inv-2' }),
      ]),
    );

    const actual = await useCase.execute({ companyId: COMPANY_ID, now: NOW });

    expect(actual.overdueInvoices).toBe(2);
  });});
