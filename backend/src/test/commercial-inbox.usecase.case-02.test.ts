import { DeliveryNoteStatus, EmailIngestionStatus, PartnerType } from '@prisma/client';
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
  });});
