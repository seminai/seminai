import { ProductCategory, PartnerType, DeliveryNoteStatus } from '@prisma/client';
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
import { ConfirmSalesOrderUseCase } from '../application/use-cases/sales-order/ConfirmSalesOrderUseCase';
import { GenerateDeliveryNoteUseCase } from '../application/use-cases/delivery-note/GenerateDeliveryNoteUseCase';
import { GetShippingSummaryUseCase } from '../application/use-cases/delivery-note/GetShippingSummaryUseCase';
import { SendCourierSummaryEmailUseCase } from '../application/use-cases/delivery-note/SendCourierSummaryEmailUseCase';

describe('Courier Summary Integration Tests', () => {
  const productRepo = new PrismaProductRepository(prisma);
  const stockRepo = new PrismaStockRepository(prisma);
  const orderRepo = new PrismaSalesOrderRepository(prisma);
  const partnerRepo = new PrismaBusinessPartnerRepository(prisma);
  const ddtRepo = new PrismaDeliveryNoteRepository(prisma);
  const companyRepo = new PrismaCompanyRepository(prisma);

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

  async function generateDdt(quantity: number): Promise<string> {
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
    return result.deliveryNote.id;
  }

  it('aggregates GENERATED DDTs and the courier summary emails + marks them SENT', async () => {
    const ddt1 = await generateDdt(5);
    const ddt2 = await generateDdt(3);
    await companyRepo.setCourierEmail(companyId, 'corriere@test.it');

    const summary = await new GetShippingSummaryUseCase(ddtRepo).execute(companyId);
    expect(summary.totals.ddtCount).toBe(2);

    const sendRawEmail = jest.fn();
    const result = await new SendCourierSummaryEmailUseCase(ddtRepo, companyRepo, {
      sendRawEmail,
    }).execute(companyId);

    expect(result.sent).toBe(2);
    expect(result.courierEmail).toBe('corriere@test.it');
    expect(sendRawEmail).toHaveBeenCalledTimes(1);
    expect(sendRawEmail.mock.calls[0][0].to).toBe('corriere@test.it');

    const reloaded1 = await ddtRepo.findById(ddt1);
    const reloaded2 = await ddtRepo.findById(ddt2);
    expect(reloaded1?.deliveryNote.status).toBe(DeliveryNoteStatus.SENT);
    expect(reloaded1?.deliveryNote.sentAt).toBeInstanceOf(Date);
    expect(reloaded2?.deliveryNote.status).toBe(DeliveryNoteStatus.SENT);

    // Nothing left to ship → the summary is now empty.
    const after = await new GetShippingSummaryUseCase(ddtRepo).execute(companyId);
    expect(after.totals.ddtCount).toBe(0);
  });

  it('refuses to send without a courier email and leaves the DDT GENERATED', async () => {
    const ddtId = await generateDdt(5);
    const sendRawEmail = jest.fn();

    await expect(
      new SendCourierSummaryEmailUseCase(ddtRepo, companyRepo, { sendRawEmail }).execute(companyId),
    ).rejects.toMatchObject({ code: 'COURIER_EMAIL_NOT_SET' });

    expect(sendRawEmail).not.toHaveBeenCalled();
    const reloaded = await ddtRepo.findById(ddtId);
    expect(reloaded?.deliveryNote.status).toBe(DeliveryNoteStatus.GENERATED);
  });

  it('is idempotent — marking an already-SENT DDT throws DDT_ALREADY_SENT', async () => {
    const ddtId = await generateDdt(5);
    await ddtRepo.markSent(ddtId);
    await expect(ddtRepo.markSent(ddtId)).rejects.toMatchObject({ code: 'DDT_ALREADY_SENT' });
  });
});
