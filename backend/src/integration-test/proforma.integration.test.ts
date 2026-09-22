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
import { PrismaProformaInvoiceRepository } from '../infrastructure/repositories/PrismaProformaInvoiceRepository';
import { GenerateProformaUseCase } from '../application/use-cases/proforma/GenerateProformaUseCase';

describe('Proforma Integration Tests', () => {
  const productRepo = new PrismaProductRepository(prisma);
  const stockRepo = new PrismaStockRepository(prisma);
  const orderRepo = new PrismaSalesOrderRepository(prisma);
  const partnerRepo = new PrismaBusinessPartnerRepository(prisma);
  const proformaRepo = new PrismaProformaInvoiceRepository(prisma);

  const useCase = new GenerateProformaUseCase(orderRepo, proformaRepo, partnerRepo, productRepo);

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

  async function createDraftOrder(quantity: number): Promise<string> {
    const order = SalesOrder.create({ companyId, partnerId });
    await orderRepo.create(order, [
      SalesOrderItem.create({ orderId: order.id, productId, quantity, unitPrice: 12, vatRate: 22 }),
    ]);
    return order.id;
  }

  it('generates a proforma without touching the warehouse or the order status', async () => {
    const orderId = await createDraftOrder(6);
    const stockBefore = await prisma.stock.count({ where: { productId } });

    const result = await useCase.execute({ orderId });

    expect(result.proformaInvoice.number).toBe(1);
    expect(result.proformaInvoice.customerSnapshot.name).toBe('Cantina Cliente');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].quantity).toBe(6);
    // No stock movements created.
    const stockAfter = await prisma.stock.count({ where: { productId } });
    expect(stockAfter).toBe(stockBefore);
    // Order stays DRAFT.
    const refreshed = await orderRepo.findById(orderId);
    expect(refreshed?.order.status).toBe('DRAFT');
  });

  it('keeps the snapshot immutable after the customer is edited and numbers progressively', async () => {
    const firstOrderId = await createDraftOrder(3);
    const first = await useCase.execute({ orderId: firstOrderId });
    expect(first.proformaInvoice.number).toBe(1);

    await partnerRepo.update(partnerId, { name: 'Nome Modificato S.r.l.' });
    const reloaded = await proformaRepo.findById(first.proformaInvoice.id);
    expect(reloaded?.proformaInvoice.customerSnapshot.name).toBe('Cantina Cliente');

    const secondOrderId = await createDraftOrder(2);
    const second = await useCase.execute({ orderId: secondOrderId });
    expect(second.proformaInvoice.number).toBe(2);
  });
});
