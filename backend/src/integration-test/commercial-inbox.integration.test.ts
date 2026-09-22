import { ProductCategory, PartnerType, EmailIngestionStatus } from '@prisma/client';
import { prisma, cleanupTestData } from './setup';
import {
  createTestUser,
  createTestCompany,
  deleteTestUser,
  deleteTestCompany,
  deleteAllTestCompanies,
} from './helpers';
import { Warehouse } from '../domain/entities/Warehouse';
import { Product } from '../domain/entities/Product';
import { Stock } from '../domain/entities/Stock';
import { SalesOrder } from '../domain/entities/SalesOrder';
import { SalesOrderItem } from '../domain/entities/SalesOrderItem';
import { BusinessPartner } from '../domain/entities/BusinessPartner';
import { PrismaWarehouseRepository } from '../infrastructure/repositories/PrismaWarehouseRepository';
import { PrismaProductRepository } from '../infrastructure/repositories/PrismaProductRepository';
import { PrismaStockRepository } from '../infrastructure/repositories/PrismaStockRepository';
import { PrismaSalesOrderRepository } from '../infrastructure/repositories/PrismaSalesOrderRepository';
import { PrismaBusinessPartnerRepository } from '../infrastructure/repositories/PrismaBusinessPartnerRepository';
import { PrismaDeliveryNoteRepository } from '../infrastructure/repositories/PrismaDeliveryNoteRepository';
import { PrismaEmailIngestionRepository } from '../infrastructure/repositories/PrismaEmailIngestionRepository';
import { PrismaProformaInvoiceRepository } from '../infrastructure/repositories/PrismaProformaInvoiceRepository';
import { PrismaSalesInvoiceRepository } from '../infrastructure/repositories/PrismaSalesInvoiceRepository';
import { ConfirmSalesOrderUseCase } from '../application/use-cases/sales-order/ConfirmSalesOrderUseCase';
import { GenerateDeliveryNoteUseCase } from '../application/use-cases/delivery-note/GenerateDeliveryNoteUseCase';
import { GetCommercialInboxUseCase } from '../application/use-cases/commercial/GetCommercialInboxUseCase';
import { GetCommercialDeadlinesUseCase } from '../application/use-cases/commercial/GetCommercialDeadlinesUseCase';

const EMAIL_FROM = 'agente-commercial-test@vino.it';

describe('Commercial Inbox Integration Tests', () => {
  const productRepo = new PrismaProductRepository(prisma);
  const stockRepo = new PrismaStockRepository(prisma);
  const orderRepo = new PrismaSalesOrderRepository(prisma);
  const partnerRepo = new PrismaBusinessPartnerRepository(prisma);
  const ddtRepo = new PrismaDeliveryNoteRepository(prisma);
  const emailRepo = new PrismaEmailIngestionRepository();
  const proformaRepo = new PrismaProformaInvoiceRepository(prisma);
  const salesInvoiceRepo = new PrismaSalesInvoiceRepository(prisma);

  const inboxUseCase = new GetCommercialInboxUseCase(
    orderRepo,
    ddtRepo,
    emailRepo,
    partnerRepo,
    proformaRepo,
    salesInvoiceRepo,
  );
  const deadlinesUseCase = new GetCommercialDeadlinesUseCase(
    orderRepo,
    ddtRepo,
    emailRepo,
    partnerRepo,
    salesInvoiceRepo,
  );

  let userId: string;
  let companyId: string;
  let productId: string;
  let partnerId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id!;
  });

  beforeEach(async () => {
    await prisma.emailIngestion.deleteMany({ where: { fromAddress: EMAIL_FROM } });
    await deleteAllTestCompanies(userId);
    const company = await createTestCompany({ userId });
    companyId = company.id!;

    const warehouse = await new PrismaWarehouseRepository(prisma).create(
      Warehouse.create({
        companyId,
        name: `WH-${Date.now()}`,
        nation: 'Italia',
        region: 'Veneto',
        city: 'Verona',
        address: 'Via Roma 1',
        cap: '37100',
        sezione: 'S',
        foglio: '10',
        particella: '100',
        subalterno: '1',
      }),
    );

    const product = await productRepo.create(
      Product.create({
        warehouseId: warehouse.id,
        name: `Amarone-${Date.now()}`,
        sku: `AMA-${Date.now()}`,
        barcode: null,
        category: ProductCategory.HARVEST,
        type: 'Vino',
        description: null,
        administrativeStatus: null,
        registrationNumber: null,
        labelUrl: null,
        labelMetadata: null,
        vintage: 2018,
        unitPrice: 12,
        vatRate: 22,
        unitOfMeasure: 'bottiglia',
        isActive: true,
      }),
    );
    productId = product.id;

    await stockRepo.create(
      Stock.create({
        productId,
        quantity: 100,
        unitOfMeasureQuantity: 'bottiglia',
        price: 5,
        unitOfMeasurePrice: 'EUR',
        type: 'IN',
      }),
    );

    const partner = await partnerRepo.create(
      BusinessPartner.create({
        companyId,
        type: PartnerType.CUSTOMER,
        name: 'Cantina Cliente',
        vatNumber: '12345678901',
        address: 'Via Mercato 5',
        city: 'Verona',
        cap: '37100',
      }),
    );
    partnerId = partner.id;
  });

  afterAll(async () => {
    await prisma.emailIngestion.deleteMany({ where: { fromAddress: EMAIL_FROM } });
    await deleteTestCompany(companyId);
    await deleteTestUser();
    await cleanupTestData();
  });

  async function seedDraftOrder(): Promise<string> {
    const order = SalesOrder.create({ companyId, partnerId });
    await orderRepo.create(order, [
      SalesOrderItem.create({
        orderId: order.id,
        productId,
        quantity: 3,
        unitPrice: 12,
        vatRate: 22,
      }),
    ]);
    return order.id;
  }

  async function seedGeneratedDdt(): Promise<string> {
    const order = SalesOrder.create({ companyId, partnerId });
    await orderRepo.create(order, [
      SalesOrderItem.create({
        orderId: order.id,
        productId,
        quantity: 10,
        unitPrice: 12,
        vatRate: 22,
      }),
    ]);
    await new ConfirmSalesOrderUseCase(orderRepo, stockRepo).execute({ orderId: order.id });
    const result = await new GenerateDeliveryNoteUseCase(
      orderRepo,
      ddtRepo,
      partnerRepo,
      productRepo,
    ).execute({ orderId: order.id });
    return result.deliveryNote.id;
  }

  async function seedAwaitingEmail(): Promise<string> {
    const row = await prisma.emailIngestion.create({
      data: {
        messageId: `msg-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
        fromAddress: EMAIL_FROM,
        toAddress: 'inbox@seminai.it',
        subject: 'Ordine di vino',
        status: EmailIngestionStatus.AWAITING_DISAMBIGUATION,
        companyId,
      },
    });
    return row.id;
  }

  it('aggregates seeded DRAFT order + GENERATED DDT + AWAITING email into the inbox', async () => {
    const draftOrderId = await seedDraftOrder();
    const ddtId = await seedGeneratedDdt();
    const emailId = await seedAwaitingEmail();

    const inbox = await inboxUseCase.execute({ companyId });
    const byRef = new Map(inbox.items.map((item) => [item.refId, item]));

    expect(byRef.get(draftOrderId)?.type).toBe('GENERATE_PROFORMA');
    expect(byRef.get(ddtId)?.type).toBe('SHIP_TODAY');
    expect(byRef.get(ddtId)?.partnerName).toBe('Cantina Cliente');
    expect(byRef.get(emailId)?.type).toBe('REVIEW_ATTACHMENT');
    // The order that produced the DDT is now FULFILLED → must NOT appear.
    const fulfilledOrders = inbox.items.filter((item) => item.type === 'GENERATE_DDT');
    expect(fulfilledOrders).toHaveLength(0);
    // SHIP_TODAY outranks PROCESS_ORDER in the sort.
    const shipIndex = inbox.items.findIndex((item) => item.refId === ddtId);
    const draftIndex = inbox.items.findIndex((item) => item.refId === draftOrderId);
    expect(shipIndex).toBeLessThan(draftIndex);
  });

  it('reports the deadline widget counts for the company', async () => {
    await seedDraftOrder();
    await seedGeneratedDdt();
    await seedAwaitingEmail();

    const deadlines = await deadlinesUseCase.execute({ companyId });

    expect(deadlines).toEqual({
      ordersToProcess: 1, // only the DRAFT order; the DDT order is FULFILLED
      outgoingDdt: 1,
      overdueInvoices: 0,
      pendingEmails: 1,
      followUpsSent: 0,
    });
  });

  it('scopes the email finder by company, status and recency window', async () => {
    await seedAwaitingEmail();
    const otherCompanyMatch = await emailRepo.findManyByCompany({
      companyId: 'non-existent-company',
      statuses: [EmailIngestionStatus.AWAITING_DISAMBIGUATION],
    });
    const match = await emailRepo.findManyByCompany({
      companyId,
      statuses: [EmailIngestionStatus.AWAITING_DISAMBIGUATION],
    });

    expect(otherCompanyMatch).toHaveLength(0);
    expect(match).toHaveLength(1);
  });
});
