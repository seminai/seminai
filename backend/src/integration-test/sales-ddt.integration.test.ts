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
import { ConfirmSalesOrderUseCase } from '../application/use-cases/sales-order/ConfirmSalesOrderUseCase';
import { GenerateDeliveryNoteUseCase } from '../application/use-cases/delivery-note/GenerateDeliveryNoteUseCase';
import { CancelDeliveryNoteUseCase } from '../application/use-cases/delivery-note/CancelDeliveryNoteUseCase';

describe('Sales DDT Integration Tests', () => {
  const productRepo = new PrismaProductRepository(prisma);
  const stockRepo = new PrismaStockRepository(prisma);
  const orderRepo = new PrismaSalesOrderRepository(prisma);
  const partnerRepo = new PrismaBusinessPartnerRepository(prisma);
  const ddtRepo = new PrismaDeliveryNoteRepository(prisma);

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

    // Initial inbound stock of 100 bottles.
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

  async function createConfirmedOrder(quantity: number): Promise<string> {
    const order = SalesOrder.create({ companyId, partnerId });
    await orderRepo.create(order, [
      SalesOrderItem.create({ orderId: order.id, productId, quantity, unitPrice: 12, vatRate: 22 }),
    ]);
    await new ConfirmSalesOrderUseCase(orderRepo, stockRepo).execute({ orderId: order.id });
    return order.id;
  }

  it('generates a DDT and unloads the warehouse (scarico)', async () => {
    const orderId = await createConfirmedOrder(10);
    const useCase = new GenerateDeliveryNoteUseCase(orderRepo, ddtRepo, partnerRepo, productRepo);

    const result = await useCase.execute({ orderId });

    expect(result.deliveryNote.number).toBe(1);
    expect(result.deliveryNote.customerSnapshot.name).toBe('Cantina Cliente');
    const available = await stockRepo.getAvailableQuantity(productId, companyId);
    expect(available).toBe(90);
    const refreshed = await orderRepo.findById(orderId);
    expect(refreshed?.order.status).toBe('FULFILLED');
    // The scarico created an OUT movement linked to the DDT.
    const outRows = await prisma.stock.count({
      where: { deliveryNoteId: result.deliveryNote.id, type: 'OUT' },
    });
    expect(outRows).toBe(1);
  });

  it('does NOT touch the warehouse when stock is insufficient (atomic rollback)', async () => {
    const orderId = await createConfirmedOrder(10);
    // Drain stock so only 5 remain, below the 10 required.
    await stockRepo.create(
      Stock.create({
        productId,
        quantity: -95,
        unitOfMeasureQuantity: 'bottiglia',
        price: 5,
        unitOfMeasurePrice: 'EUR',
        type: 'OUT',
      }),
    );
    const beforeCount = await prisma.stock.count({ where: { productId } });

    const useCase = new GenerateDeliveryNoteUseCase(orderRepo, ddtRepo, partnerRepo, productRepo);
    await expect(useCase.execute({ orderId })).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
    });

    const afterCount = await prisma.stock.count({ where: { productId } });
    expect(afterCount).toBe(beforeCount);
    const ddtCount = await prisma.deliveryNote.count({ where: { orderId } });
    expect(ddtCount).toBe(0);
  });

  it('restores the warehouse when a DDT is cancelled (storno/rientro)', async () => {
    const orderId = await createConfirmedOrder(10);
    const generated = await new GenerateDeliveryNoteUseCase(
      orderRepo,
      ddtRepo,
      partnerRepo,
      productRepo,
    ).execute({ orderId });
    expect(await stockRepo.getAvailableQuantity(productId, companyId)).toBe(90);

    const cancelled = await new CancelDeliveryNoteUseCase(ddtRepo).execute({
      deliveryNoteId: generated.deliveryNote.id,
      reason: 'reso cliente',
    });

    expect(cancelled.deliveryNote.status).toBe('CANCELLED');
    expect(await stockRepo.getAvailableQuantity(productId, companyId)).toBe(100);
  });

  it('keeps the DDT snapshot immutable after the customer is edited', async () => {
    const orderId = await createConfirmedOrder(5);
    const generated = await new GenerateDeliveryNoteUseCase(
      orderRepo,
      ddtRepo,
      partnerRepo,
      productRepo,
    ).execute({ orderId });

    await partnerRepo.update(partnerId, { name: 'Nome Modificato S.r.l.' });

    const reloaded = await ddtRepo.findById(generated.deliveryNote.id);
    expect(reloaded?.deliveryNote.customerSnapshot.name).toBe('Cantina Cliente');
  });
});
