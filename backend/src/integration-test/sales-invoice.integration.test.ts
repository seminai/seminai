import { ProductCategory, PartnerType } from '@prisma/client';
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
import { PrismaCompanyRepository } from '../infrastructure/repositories/PrismaCompanyRepository';
import { PrismaSalesInvoiceRepository } from '../infrastructure/repositories/PrismaSalesInvoiceRepository';
import { ConfirmSalesOrderUseCase } from '../application/use-cases/sales-order/ConfirmSalesOrderUseCase';
import { GenerateDeliveryNoteUseCase } from '../application/use-cases/delivery-note/GenerateDeliveryNoteUseCase';
import { SendPaymentReminderEmailUseCase } from '../application/use-cases/sales-invoice/SendPaymentReminderEmailUseCase';
import { MarkInvoicePaidUseCase } from '../application/use-cases/sales-invoice/MarkInvoicePaidUseCase';

describe('Sales Invoice Integration Tests', () => {
  const productRepo = new PrismaProductRepository(prisma);
  const stockRepo = new PrismaStockRepository(prisma);
  const orderRepo = new PrismaSalesOrderRepository(prisma);
  const partnerRepo = new PrismaBusinessPartnerRepository(prisma);
  const ddtRepo = new PrismaDeliveryNoteRepository(prisma);
  const companyRepo = new PrismaCompanyRepository(prisma);
  const invoiceRepo = new PrismaSalesInvoiceRepository(prisma);

  let userId: string;
  let companyId: string;
  let productId: string;
  let partnerId: string;

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id!;
  });

  beforeEach(async () => {
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
        email: 'cliente@vino.it',
        address: 'Via Mercato 5',
        city: 'Verona',
        cap: '37100',
      }),
    );
    partnerId = partner.id;
  });

  afterAll(async () => {
    await deleteTestCompany(companyId);
    await deleteTestUser();
    await cleanupTestData();
  });

  async function shipDdt(quantity: number): Promise<string> {
    const order = SalesOrder.create({ companyId, partnerId });
    await orderRepo.create(order, [
      SalesOrderItem.create({ orderId: order.id, productId, quantity, unitPrice: 12, vatRate: 22 }),
    ]);
    await new ConfirmSalesOrderUseCase(orderRepo, stockRepo).execute({ orderId: order.id });
    const result = await new GenerateDeliveryNoteUseCase(
      orderRepo,
      ddtRepo,
      partnerRepo,
      productRepo,
    ).execute({ orderId: order.id });
    await ddtRepo.markSent(result.deliveryNote.id);
    return result.deliveryNote.id;
  }

  it('auto-creates a sales invoice when a DDT is marked SENT', async () => {
    const ddtId = await shipDdt(10);

    const invoices = (await invoiceRepo.findManyByCompany(companyId)).filter(
      (entry) => entry.salesInvoice.deliveryNoteId === ddtId,
    );
    expect(invoices).toHaveLength(1);
    const invoice = invoices[0].salesInvoice;
    expect(invoice.number).toBe(1);
    // 10 × 12 × (1 + 22%) = 146.4
    expect(invoice.totalAmount).toBeCloseTo(146.4, 2);
    expect(invoice.paidAt).toBeNull();
    const daysUntilDue = Math.round(
      (invoice.dueDate.getTime() - invoice.invoiceDate.getTime()) / (24 * 60 * 60 * 1000),
    );
    expect(daysUntilDue).toBe(30);
    // Freshly due in 30 days ⇒ not overdue yet.
    expect(await invoiceRepo.findOverdueByCompany(companyId, new Date())).toHaveLength(0);
  });

  it('surfaces an overdue invoice, sends a reminder, then drops it once paid', async () => {
    const ddtId = await shipDdt(5);
    const created = (await invoiceRepo.findManyByCompany(companyId)).find(
      (entry) => entry.salesInvoice.deliveryNoteId === ddtId,
    )!;
    const invoiceId = created.salesInvoice.id;
    // Force the due date into the past to simulate an overdue invoice.
    await prisma.salesInvoice.update({
      where: { id: invoiceId },
      data: { dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
    });

    const overdue = await invoiceRepo.findOverdueByCompany(companyId, new Date());
    expect(overdue.map((entry) => entry.salesInvoice.id)).toContain(invoiceId);

    const sendRawEmail = jest.fn();
    const reminder = await new SendPaymentReminderEmailUseCase(
      invoiceRepo,
      partnerRepo,
      companyRepo,
      { sendRawEmail },
    ).execute(invoiceId);
    expect(reminder.sent).toBe(true);
    expect(sendRawEmail).toHaveBeenCalledTimes(1);
    expect(sendRawEmail.mock.calls[0][0].to).toBe('cliente@vino.it');
    expect((await invoiceRepo.findById(invoiceId))?.salesInvoice.lastReminderAt).toBeInstanceOf(
      Date,
    );

    await new MarkInvoicePaidUseCase(invoiceRepo).execute(invoiceId);
    const afterPaid = await invoiceRepo.findOverdueByCompany(companyId, new Date());
    expect(afterPaid.map((entry) => entry.salesInvoice.id)).not.toContain(invoiceId);
  });
});
