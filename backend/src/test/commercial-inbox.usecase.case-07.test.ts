import { EmailIngestionStatus, SalesOrderStatus } from '@prisma/client';
import { SalesOrder } from '../domain/entities/SalesOrder';
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
  });});
