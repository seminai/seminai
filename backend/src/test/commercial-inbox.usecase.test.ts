import {
  DeliveryNoteStatus,
  EmailIngestionStatus,
  PartnerType,
  SalesOrderStatus,
} from '@prisma/client';
import { SalesOrder } from '../domain/entities/SalesOrder';
import { DeliveryNote } from '../domain/entities/DeliveryNote';
import { EmailIngestion } from '../domain/entities/EmailIngestion';
import { BusinessPartner } from '../domain/entities/BusinessPartner';
import { buildCustomerSnapshot } from '../domain/utils/customer-snapshot';
import {
  ISalesOrderRepository,
  SalesOrderWithItems,
} from '../domain/repositories/ISalesOrderRepository';
import {
  IDeliveryNoteRepository,
  DeliveryNoteWithItems,
} from '../domain/repositories/IDeliveryNoteRepository';
import { IEmailIngestionRepository } from '../domain/repositories/IEmailIngestionRepository';
import { IBusinessPartnerRepository } from '../domain/repositories/IBusinessPartnerRepository';
import { IProformaInvoiceRepository } from '../domain/repositories/IProformaInvoiceRepository';
import {
  ISalesInvoiceRepository,
  SalesInvoiceWithItems,
} from '../domain/repositories/ISalesInvoiceRepository';
import { GetCommercialInboxUseCase } from '../application/use-cases/commercial/GetCommercialInboxUseCase';
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
  });

  it('emits a single aggregated SEND_COURIER_SUMMARY row when GENERATED DDTs exist', async () => {
    const useCase = new GetCommercialInboxUseCase(
      salesOrderRepoMock([]),
      ddtRepoMock([
        makeDdt({ id: 'ddt-1', ddtDate: daysAgo(1) }),
        makeDdt({ id: 'ddt-2', ddtDate: daysAgo(3) }),
      ]),
      emailRepoMock([], []),
      partnerRepoMock([]),
      proformaRepoMock([]),
      salesInvoiceRepoMock(),
    );

    const actual = await useCase.execute({ companyId: COMPANY_ID, now: NOW });
    const courier = actual.items.filter((item) => item.type === 'SEND_COURIER_SUMMARY');

    expect(courier).toHaveLength(1);
    expect(courier[0]).toMatchObject({
      refId: COMPANY_ID,
      action: 'SEND_COURIER_SUMMARY',
      priority: 'HIGH',
      ctaLabelKey: 'commercial.inbox.cta.sendCourierSummary',
    });
    expect(courier[0].subtitle).toContain('2 DDT');
    expect(actual.items[0].type).toBe('SEND_COURIER_SUMMARY'); // sorted first (weight 0)
  });

  it('omits the SEND_COURIER_SUMMARY row when there are no GENERATED DDTs', async () => {
    const useCase = new GetCommercialInboxUseCase(
      salesOrderRepoMock([]),
      ddtRepoMock([]),
      emailRepoMock([], []),
      partnerRepoMock([]),
      proformaRepoMock([]),
      salesInvoiceRepoMock(),
    );

    const actual = await useCase.execute({ companyId: COMPANY_ID, now: NOW });

    expect(actual.items.some((item) => item.type === 'SEND_COURIER_SUMMARY')).toBe(false);
  });

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
  });

  it('maps order status + proforma presence to the right inbox type', async () => {
    const useCase = new GetCommercialInboxUseCase(
      salesOrderRepoMock([
        makeOrder({
          id: 'o-draft-new',
          partnerId: 'p',
          status: SalesOrderStatus.DRAFT,
          orderDate: daysAgo(1),
        }),
        makeOrder({
          id: 'o-draft-pf',
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
        makeOrder({
          id: 'o-can',
          partnerId: 'p',
          status: SalesOrderStatus.CANCELLED,
          orderDate: daysAgo(1),
        }),
      ]),
      ddtRepoMock([]),
      emailRepoMock([], []),
      partnerRepoMock([]),
      proformaRepoMock(['o-draft-pf']),
      salesInvoiceRepoMock(),
    );

    const actual = await useCase.execute({ companyId: COMPANY_ID, now: NOW });
    const byRef = new Map(actual.items.map((item) => [item.refId, item.type]));

    expect(actual.items).toHaveLength(3);
    expect(byRef.get('o-draft-new')).toBe('GENERATE_PROFORMA'); // DRAFT, no proforma
    expect(byRef.get('o-draft-pf')).toBe('PROCESS_ORDER'); // DRAFT, proforma already sent
    expect(byRef.get('o-conf')).toBe('GENERATE_DDT');
    expect(byRef.has('o-ful')).toBe(false);
    expect(byRef.has('o-can')).toBe(false);
  });

  it('resolves partnerName from the partner map (orders) and customerSnapshot (DDT)', async () => {
    const customer = makeCustomer('Azienda Bianchi');
    const useCase = new GetCommercialInboxUseCase(
      salesOrderRepoMock([
        makeOrder({
          id: 'o-draft',
          partnerId: customer.id,
          status: SalesOrderStatus.DRAFT,
          orderDate: daysAgo(1),
        }),
      ]),
      ddtRepoMock([makeDdt({ id: 'ddt-1', ddtDate: daysAgo(1), customerName: 'Cantina Verdi' })]),
      emailRepoMock([], []),
      partnerRepoMock([customer]),
      proformaRepoMock([]),
      salesInvoiceRepoMock(),
    );

    const actual = await useCase.execute({ companyId: COMPANY_ID, now: NOW });
    const order = actual.items.find((item) => item.refId === 'o-draft');
    const ddt = actual.items.find((item) => item.refId === 'ddt-1');

    expect(order?.partnerName).toBe('Azienda Bianchi');
    expect(ddt?.partnerName).toBe('Cantina Verdi');
  });

  it('derives sourceChannel from the order sourceRef and tags email items as EMAIL', async () => {
    const useCase = new GetCommercialInboxUseCase(
      salesOrderRepoMock([
        makeOrder({
          id: 'o-email',
          partnerId: 'p',
          status: SalesOrderStatus.DRAFT,
          orderDate: daysAgo(1),
          sourceRef: 'email:ing-1',
        }),
      ]),
      ddtRepoMock([]),
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
      proformaRepoMock([]),
      salesInvoiceRepoMock(),
    );

    const actual = await useCase.execute({ companyId: COMPANY_ID, now: NOW });
    const order = actual.items.find((item) => item.refId === 'o-email');
    const email = actual.items.find((item) => item.refId === 'mail-1');

    expect(order?.sourceChannel).toBe('EMAIL');
    expect(email?.sourceChannel).toBe('EMAIL');
  });

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
  });
});

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
  });

  it('counts only customers reminded within the last 7 days as followUpsSent', async () => {
    const recent = { ...makeCustomer('Recente'), followUpLastSentAt: daysAgo(2) };
    const stale = { ...makeCustomer('Vecchio'), followUpLastSentAt: daysAgo(10) };
    const never = makeCustomer('Mai'); // followUpLastSentAt = null
    const useCase = new GetCommercialDeadlinesUseCase(
      salesOrderRepoMock([]),
      ddtRepoMock([]),
      emailRepoMock([], []),
      partnerRepoMock([recent, stale, never]),
      salesInvoiceRepoMock(),
    );

    const actual = await useCase.execute({ companyId: COMPANY_ID, now: NOW });

    expect(actual.followUpsSent).toBe(1);
  });

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
  });
});
