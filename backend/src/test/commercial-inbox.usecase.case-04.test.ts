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
describe('GetCommercialInboxUseCase', () => {

  it('emits a per-invoice SEND_PAYMENT_REMINDER row for each overdue invoice (weight 1)', async () => {
    const useCase = new GetCommercialInboxUseCase(
      salesOrderRepoMock([]),
      ddtRepoMock([]),
      emailRepoMock([], []),
      partnerRepoMock([]),
      proformaRepoMock([]),
      salesInvoiceRepoMock([
        makeOverdueInvoice({ id: 'inv-1', totalAmount: 250, customerName: 'Cantina Blu' }),
      ]),
    );

    const actual = await useCase.execute({ companyId: COMPANY_ID, now: NOW });
    const reminder = actual.items.find((item) => item.type === 'SEND_PAYMENT_REMINDER');

    expect(reminder).toMatchObject({
      refId: 'inv-1',
      action: 'SEND_PAYMENT_REMINDER',
      priority: 'HIGH',
      partnerName: 'Cantina Blu',
      ctaLabelKey: 'commercial.inbox.cta.sendPaymentReminder',
    });
    expect(actual.items[0].type).toBe('SEND_PAYMENT_REMINDER'); // weight 1, nothing higher present
  });});
