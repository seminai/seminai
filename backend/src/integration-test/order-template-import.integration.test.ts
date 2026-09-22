import * as XLSX from 'xlsx';
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
import { BusinessPartner } from '../domain/entities/BusinessPartner';
import { PrismaWarehouseRepository } from '../infrastructure/repositories/PrismaWarehouseRepository';
import { PrismaProductRepository } from '../infrastructure/repositories/PrismaProductRepository';
import { PrismaSalesOrderRepository } from '../infrastructure/repositories/PrismaSalesOrderRepository';
import { PrismaBusinessPartnerRepository } from '../infrastructure/repositories/PrismaBusinessPartnerRepository';
import { PrismaDeliveryNoteRepository } from '../infrastructure/repositories/PrismaDeliveryNoteRepository';
import { PrismaEmailIngestionRepository } from '../infrastructure/repositories/PrismaEmailIngestionRepository';
import { PrismaProformaInvoiceRepository } from '../infrastructure/repositories/PrismaProformaInvoiceRepository';
import { PrismaSalesInvoiceRepository } from '../infrastructure/repositories/PrismaSalesInvoiceRepository';
import { CreateSalesOrderUseCase } from '../application/use-cases/sales-order/CreateSalesOrderUseCase';
import { CreateOrUpdatePartnerFromExtractionUseCase } from '../application/use-cases/business-partner/CreateOrUpdatePartnerFromExtractionUseCase';
import { ImportSalesOrderFromTemplateUseCase } from '../application/use-cases/sales-order/ImportSalesOrderFromTemplateUseCase';
import { GetCommercialInboxUseCase } from '../application/use-cases/commercial/GetCommercialInboxUseCase';

const PRODUCT_NAME = 'Amarone Modello Test';

function buildTemplateBuffer(productName: string): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Nome cliente', 'Cantina Cliente'],
    ['P.IVA', '12345678901'],
    [],
    ['Prodotto', 'Annata', 'Quantità', 'Prezzo unitario'],
    [productName, 2018, 6, ''],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Ordine');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('Order Template Import Integration Tests', () => {
  const productRepo = new PrismaProductRepository(prisma);
  const orderRepo = new PrismaSalesOrderRepository(prisma);
  const partnerRepo = new PrismaBusinessPartnerRepository(prisma);
  const ddtRepo = new PrismaDeliveryNoteRepository(prisma);
  const emailRepo = new PrismaEmailIngestionRepository();
  const proformaRepo = new PrismaProformaInvoiceRepository(prisma);
  const salesInvoiceRepo = new PrismaSalesInvoiceRepository(prisma);

  const importUseCase = new ImportSalesOrderFromTemplateUseCase(
    productRepo,
    partnerRepo,
    new CreateSalesOrderUseCase(orderRepo, productRepo, partnerRepo),
    new CreateOrUpdatePartnerFromExtractionUseCase(partnerRepo),
  );
  const inboxUseCase = new GetCommercialInboxUseCase(
    orderRepo,
    ddtRepo,
    emailRepo,
    partnerRepo,
    proformaRepo,
    salesInvoiceRepo,
  );

  let userId: string;
  let companyId: string;

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

    await productRepo.create(
      Product.create({
        warehouseId: warehouse.id,
        name: PRODUCT_NAME,
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

    await partnerRepo.create(
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
  });

  afterAll(async () => {
    await deleteTestCompany(companyId);
    await deleteTestUser();
    await cleanupTestData();
  });

  it('previews a matching template as creatable, commits a DRAFT order, and it appears in the inbox', async () => {
    const fileBuffer = buildTemplateBuffer(PRODUCT_NAME);

    const preview = await importUseCase.preview({ fileBuffer, fileName: 'ordine.xlsx', companyId });
    expect(preview.canCreate).toBe(true);
    expect(preview.partner.matchedId).not.toBeNull();
    expect(preview.lines[0].matchedProductId).not.toBeNull();

    const result = await importUseCase.commit({
      companyId,
      partnerId: preview.partner.matchedId!,
      customerName: preview.standardOrder.customerName,
      customerVat: preview.standardOrder.customerVat,
      lines: preview.lines,
      deliveryNotesText: preview.standardOrder.deliveryNotesText,
      sourceChannel: 'template',
      sourceRef: 'template',
    });
    expect(result.order.order.status).toBe('DRAFT');
    expect(result.order.items).toHaveLength(1);
    expect(result.order.items[0].quantity).toBe(6);

    const inbox = await inboxUseCase.execute({ companyId });
    const item = inbox.items.find((i) => i.refId === result.order.order.id);
    // A fresh DRAFT order with no proforma yet surfaces as GENERATE_PROFORMA.
    expect(item?.type).toBe('GENERATE_PROFORMA');
  });

  it('auto-creates the customer and commits a DRAFT order for an unknown customer', async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Nome cliente', 'Cliente Sconosciuto'],
      ['P.IVA', 'IT99999999999'],
      [],
      ['Prodotto', 'Annata', 'Quantità', 'Prezzo unitario'],
      [PRODUCT_NAME, 2018, 6, ''],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Ordine');
    const fileBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const preview = await importUseCase.preview({ fileBuffer, fileName: 'ordine.xlsx', companyId });
    expect(preview.partner.matchedId).toBeNull();
    expect(preview.partner.willCreate).toBe(true);
    expect(preview.warnings).toContain('CUSTOMER_WILL_BE_CREATED');
    expect(preview.canCreate).toBe(true);

    const result = await importUseCase.commit({
      companyId,
      customerName: preview.standardOrder.customerName,
      customerVat: preview.standardOrder.customerVat,
      lines: preview.lines,
      sourceChannel: 'template',
      sourceRef: 'template',
    });
    expect(result.order.order.status).toBe('DRAFT');
    // The new customer now exists in the anagrafica with a normalized VAT.
    const created = await partnerRepo.findDuplicate({
      companyId,
      type: PartnerType.CUSTOMER,
      vatNumber: '99999999999',
    });
    expect(created?.name).toBe('Cliente Sconosciuto');
  });
});
