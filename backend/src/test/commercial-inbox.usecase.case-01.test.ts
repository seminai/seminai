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
import { IProformaInvoiceRepository } from '../domain/repositories/IProformaInvoiceRepository';
import { ISalesInvoiceRepository, SalesInvoiceWithItems } from '../domain/repositories/ISalesInvoiceRepository';
import { GetCommercialInboxUseCase } from '../application/use-cases/commercial/GetCommercialInboxUseCase';

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
  it('sorts items by priority weight then by age (oldest first within a bucket)', async () => {
    const customer = makeCustomer('Cantina Rossi');
    const useCase = new GetCommercialInboxUseCase(
      salesOrderRepoMock([
        makeOrder({
          id: 'o-draft',
          partnerId: customer.id,
          status: SalesOrderStatus.DRAFT,
          orderDate: daysAgo(1),
        }),
        makeOrder({
          id: 'o-conf',
          partnerId: customer.id,
          status: SalesOrderStatus.CONFIRMED,
          orderDate: daysAgo(1),
        }),
      ]),
      ddtRepoMock([
        makeDdt({ id: 'ddt-new', ddtDate: daysAgo(1) }),
        makeDdt({ id: 'ddt-old', ddtDate: daysAgo(5) }),
      ]),
      emailRepoMock(
        [
          makeEmail({
            id: 'mail-await',
            status: EmailIngestionStatus.AWAITING_DISAMBIGUATION,
            receivedAt: daysAgo(2),
          }),
        ],
        [
          makeEmail({
            id: 'mail-disp',
            status: EmailIngestionStatus.DISPATCHED,
            receivedAt: daysAgo(1),
            threadId: 'thr-1',
          }),
        ],
      ),
      partnerRepoMock([customer]),
      proformaRepoMock([]),
      salesInvoiceRepoMock(),
    );

    const actual = await useCase.execute({ companyId: COMPANY_ID, now: NOW });

    expect(actual.items.map((item) => item.type)).toEqual([
      'SEND_COURIER_SUMMARY', // aggregated courier row (weight 0)
      'SHIP_TODAY', // ddt-old (weight 1, older)
      'SHIP_TODAY', // ddt-new (weight 1, newer)
      'GENERATE_DDT', // o-conf (weight 2)
      'GENERATE_PROFORMA', // o-draft, no proforma yet (weight 3)
      'REVIEW_ATTACHMENT', // mail-await (weight 4)
      'OPEN_CHAT', // mail-disp (weight 6)
    ]);
    expect(actual.items[1].refId).toBe('ddt-old');
    expect(actual.items[2].refId).toBe('ddt-new');
  });});
