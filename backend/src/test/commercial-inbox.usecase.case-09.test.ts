import { DeliveryNoteStatus, EmailIngestionStatus, PartnerType, SalesOrderStatus } from '@prisma/client';
import { SalesOrder } from '../domain/entities/SalesOrder';
import { DeliveryNote } from '../domain/entities/DeliveryNote';
import { EmailIngestion } from '../domain/entities/EmailIngestion';
import { BusinessPartner } from '../domain/entities/BusinessPartner';
import { buildCustomerSnapshot } from '../domain/utils/customer-snapshot';
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

function makeCustomer(name = 'Cantina Cliente'): BusinessPartner {
  return BusinessPartner.create({
    companyId: COMPANY_ID,
    type: PartnerType.CUSTOMER,
    name,
    vatNumber: '12345678901',
    address: 'Via Roma 1',
    city: 'Verona',
  });
}

function makeOrder(input: {
  id: string;
  partnerId: string;
  status: SalesOrderStatus;
  orderDate: Date;
  sourceRef?: string | null;
}): SalesOrderWithItems {
  return {
    order: new SalesOrder({
      id: input.id,
      companyId: COMPANY_ID,
      partnerId: input.partnerId,
      orderDate: input.orderDate,
      status: input.status,
      internalNotes: null,
      deliveryNotesText: null,
      sourceRef: input.sourceRef ?? null,
      createdAt: input.orderDate,
      updatedAt: input.orderDate,
    }),
    items: [],
  };
}

function makeDdt(input: {
  id: string;
  ddtDate: Date;
  customerName?: string;
}): DeliveryNoteWithItems {
  return {
    deliveryNote: new DeliveryNote({
      id: input.id,
      companyId: COMPANY_ID,
      partnerId: 'partner-x',
      orderId: null,
      number: 1,
      year: 2026,
      ddtDate: input.ddtDate,
      status: DeliveryNoteStatus.GENERATED,
      causale: null,
      carrier: null,
      packagesCount: null,
      estimatedWeightKg: null,
      deliveryNotesText: null,
      customerSnapshot: buildCustomerSnapshot(makeCustomer(input.customerName ?? 'Cantina DDT')),
      htmlUrl: null,
      sentAt: null,
      cancelledAt: null,
      cancelReason: null,
      createdAt: input.ddtDate,
      updatedAt: input.ddtDate,
    }),
    items: [],
  };
}

function makeEmail(input: {
  id: string;
  status: EmailIngestionStatus;
  receivedAt: Date;
  subject?: string;
  threadId?: string;
}): EmailIngestion {
  return new EmailIngestion(
    input.id,
    `${input.id}-msg`,
    input.status,
    'agente@vino.it',
    'inbox@seminai.it',
    input.receivedAt,
    input.subject,
    undefined,
    input.threadId,
  );
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
describe('GetCommercialDeadlinesUseCase', () => {
  it('counts orders to process (DRAFT+CONFIRMED), outgoing DDT and pending emails; overdue stays 0', async () => {
    const useCase = new GetCommercialDeadlinesUseCase(
      salesOrderRepoMock([
        makeOrder({
          id: 'o-draft',
          partnerId: 'p',
          status: SalesOrderStatus.DRAFT,
          orderDate: daysAgo(1),
        }),
        makeOrder({
          id: 'o-conf',
          partnerId: 'p',
          status: SalesOrderStatus.CONFIRMED,
          orderDate: daysAgo(1),
        }),
        makeOrder({
          id: 'o-ful',
          partnerId: 'p',
          status: SalesOrderStatus.FULFILLED,
          orderDate: daysAgo(1),
        }),
      ]),
      ddtRepoMock([makeDdt({ id: 'ddt-1', ddtDate: daysAgo(1) })]),
      emailRepoMock(
        [
          makeEmail({
            id: 'mail-1',
            status: EmailIngestionStatus.AWAITING_DISAMBIGUATION,
            receivedAt: daysAgo(1),
          }),
        ],
        [],
      ),
      partnerRepoMock([]),
      salesInvoiceRepoMock(),
    );

    const actual = await useCase.execute({ companyId: COMPANY_ID, now: NOW });

    expect(actual).toEqual({
      ordersToProcess: 2,
      outgoingDdt: 1,
      overdueInvoices: 0,
      pendingEmails: 1,
      followUpsSent: 0,
    });
  });});
