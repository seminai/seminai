import {
  DeliveryNoteStatus,
  PartnerType,
  PrismaClient,
  Product,
  ProductCategory,
  SalesOrderStatus,
  Warehouse,
} from '../../src/generated/prisma/client';

interface SalesSeedParams {
  readonly companyId: string;
  readonly warehouses: readonly Warehouse[];
}

interface SalesSeedContext {
  readonly customers: readonly { readonly id: string; readonly name: string }[];
  readonly harvestProducts: readonly Product[];
  readonly draftOrderId: string;
  readonly confirmedOrderId: string;
  readonly deliveryNoteId: string;
}

const HARVEST_PRODUCTS = [
  {
    name: 'Lambrusco Ancellotta IGP 2024',
    sku: 'LAM-ANC-2024',
    vintage: 2024,
    unitPrice: 6.5,
    vatRate: 22,
    unitOfMeasure: 'bottiglia',
    stockQuantity: 480,
  },
  {
    name: 'Lambrusco Grasparossa DOC 2023',
    sku: 'LAM-GRA-2023',
    vintage: 2023,
    unitPrice: 8.0,
    vatRate: 22,
    unitOfMeasure: 'bottiglia',
    stockQuantity: 320,
  },
  {
    name: "Mosto d'Uva Concentrato",
    sku: 'MOSTO-CONC-2025',
    vintage: 2025,
    unitPrice: 2.4,
    vatRate: 10,
    unitOfMeasure: 'L',
    stockQuantity: 1200,
  },
] as const;

const CUSTOMERS = [
  {
    name: 'Enoteca del Duomo',
    vatNumber: 'IT04567890123',
    fiscalCode: 'NTCDMO80A01H501X',
    sdiCode: 'M5UXCR1',
    email: 'ordini@enotecaduomo.demo',
    phone: '+390521334455',
    referent: 'Marco Bianchi',
    city: 'Parma',
    address: 'Piazza del Duomo 3',
    cap: '43121',
    deliveryCity: 'Parma',
    deliveryAddress: 'Via Emilia 120 - Magazzino',
    deliveryCap: '43122',
    deliveryHours: 'Lun-Ven 8:00-17:00',
  },
  {
    name: 'Consorzio Vini Emilia',
    vatNumber: 'IT09876543210',
    email: 'acquisti@consorziovini.demo',
    phone: '+390522667788',
    referent: 'Laura Verdi',
    city: 'Reggio Emilia',
    address: 'Via Roma 45',
    cap: '42121',
    deliveryCity: 'Reggio Emilia',
    deliveryAddress: 'Zona Industriale Ovest 7',
    deliveryCap: '42122',
  },
] as const;

export async function seedSalesModule(
  prisma: PrismaClient,
  params: SalesSeedParams,
): Promise<SalesSeedContext> {
  const warehouse = params.warehouses[0];
  const harvestProducts = await seedHarvestProducts(prisma, warehouse.id);
  const customers = await seedCustomers(prisma, params.companyId);
  const draftOrderId = await seedDraftOrder(prisma, {
    companyId: params.companyId,
    partnerId: customers[0].id,
    products: harvestProducts,
  });
  const confirmedOrderId = await seedConfirmedOrder(prisma, {
    companyId: params.companyId,
    partnerId: customers[1].id,
    products: harvestProducts,
  });
  const deliveryNoteId = await seedSampleDeliveryNote(prisma, {
    companyId: params.companyId,
    partner: customers[1],
    orderId: confirmedOrderId,
    product: harvestProducts[1],
  });
  return {
    customers,
    harvestProducts,
    draftOrderId,
    confirmedOrderId,
    deliveryNoteId,
  };
}

async function seedHarvestProducts(prisma: PrismaClient, warehouseId: string): Promise<Product[]> {
  const products: Product[] = [];
  for (const source of HARVEST_PRODUCTS) {
    const product = await prisma.product.create({
      data: {
        warehouseId,
        name: source.name,
        sku: source.sku,
        barcode: `805${source.sku.replace(/[^0-9A-Z]/gi, '').slice(0, 10)}`,
        category: ProductCategory.HARVEST,
        type: 'Vino',
        description: `Raccolto Seminai Fruit Farm — ${source.name}`,
        vintage: source.vintage,
        unitPrice: source.unitPrice,
        vatRate: source.vatRate,
        unitOfMeasure: source.unitOfMeasure,
        isActive: true,
      },
    });
    await prisma.stock.create({
      data: {
        productId: product.id,
        quantity: source.stockQuantity,
        unitOfMeasureQuantity: source.unitOfMeasure,
        price: source.unitPrice * 0.6,
        unitOfMeasurePrice: 'EUR',
        type: 'IN',
        ddtCode: `CARICO-${source.sku}`,
        companySupplierName: 'Seminai Fruit Farm',
        addressSupplier: 'Strada Provinciale 15, 12, Parma',
        vatNumberSupplier: 'IT12345678901',
      },
    });
    products.push(product);
  }
  return products;
}

async function seedCustomers(
  prisma: PrismaClient,
  companyId: string,
): Promise<{ id: string; name: string }[]> {
  const customers: { id: string; name: string }[] = [];
  for (const source of CUSTOMERS) {
    const partner = await prisma.businessPartner.create({
      data: {
        companyId,
        type: PartnerType.CUSTOMER,
        name: source.name,
        vatNumber: source.vatNumber,
        fiscalCode: 'fiscalCode' in source ? source.fiscalCode : undefined,
        sdiCode: 'sdiCode' in source ? source.sdiCode : undefined,
        email: source.email,
        phone: source.phone,
        referent: source.referent,
        nation: 'Italia',
        city: source.city,
        address: source.address,
        cap: source.cap,
        deliveryCity: source.deliveryCity,
        deliveryAddress: source.deliveryAddress,
        deliveryCap: source.deliveryCap,
        deliveryNation: 'Italia',
        deliveryHours: 'deliveryHours' in source ? source.deliveryHours : undefined,
      },
    });
    customers.push({ id: partner.id, name: partner.name });
  }
  return customers;
}

async function seedDraftOrder(
  prisma: PrismaClient,
  params: {
    readonly companyId: string;
    readonly partnerId: string;
    readonly products: readonly Product[];
  },
): Promise<string> {
  const order = await prisma.salesOrder.create({
    data: {
      companyId: params.companyId,
      partnerId: params.partnerId,
      status: SalesOrderStatus.DRAFT,
      internalNotes: 'Bozza ordine enoteca — in attesa conferma cliente',
      deliveryNotesText: 'Consegna al piano strada',
      sourceRef: 'seed:draft-order',
      items: {
        create: [
          {
            productId: params.products[0].id,
            quantity: 60,
            unitPrice: params.products[0].unitPrice ?? 6.5,
            discount: 5,
            vatRate: params.products[0].vatRate ?? 22,
          },
          {
            productId: params.products[2].id,
            quantity: 100,
            unitPrice: params.products[2].unitPrice ?? 2.4,
            discount: 0,
            vatRate: params.products[2].vatRate ?? 10,
          },
        ],
      },
    },
  });
  return order.id;
}

async function seedConfirmedOrder(
  prisma: PrismaClient,
  params: {
    readonly companyId: string;
    readonly partnerId: string;
    readonly products: readonly Product[];
  },
): Promise<string> {
  const order = await prisma.salesOrder.create({
    data: {
      companyId: params.companyId,
      partnerId: params.partnerId,
      status: SalesOrderStatus.CONFIRMED,
      orderDate: new Date('2026-06-10T09:00:00.000Z'),
      internalNotes: 'Ordine confermato — giacenza riservata',
      sourceRef: 'seed:confirmed-order',
      items: {
        create: [
          {
            productId: params.products[1].id,
            quantity: 24,
            unitPrice: params.products[1].unitPrice ?? 8,
            discount: 0,
            vatRate: params.products[1].vatRate ?? 22,
          },
        ],
      },
    },
  });
  return order.id;
}

async function seedSampleDeliveryNote(
  prisma: PrismaClient,
  params: {
    readonly companyId: string;
    readonly partner: { readonly id: string; readonly name: string };
    readonly orderId: string;
    readonly product: Product;
  },
): Promise<string> {
  const year = 2026;
  const customerSnapshot = {
    name: params.partner.name,
    vatNumber: 'IT09876543210',
    address: 'Zona Industriale Ovest 7',
    city: 'Reggio Emilia',
    cap: '42122',
    nation: 'Italia',
  };
  const deliveryNote = await prisma.deliveryNote.create({
    data: {
      companyId: params.companyId,
      partnerId: params.partner.id,
      orderId: params.orderId,
      number: 1,
      year,
      ddtDate: new Date('2026-06-12T08:30:00.000Z'),
      status: DeliveryNoteStatus.GENERATED,
      causale: 'Vendita',
      carrier: 'Corriere Emilia Express',
      packagesCount: 2,
      estimatedWeightKg: 18.5,
      deliveryNotesText: 'Fragile — mantenere in posizione verticale',
      customerSnapshot,
      items: {
        create: [
          {
            productId: params.product.id,
            productName: params.product.name,
            sku: params.product.sku,
            vintage: params.product.vintage,
            unitOfMeasure: params.product.unitOfMeasure,
            quantity: 24,
            unitPrice: params.product.unitPrice ?? 8,
            discount: 0,
            vatRate: params.product.vatRate ?? 22,
          },
        ],
      },
    },
  });
  await prisma.stock.create({
    data: {
      productId: params.product.id,
      quantity: 24,
      unitOfMeasureQuantity: params.product.unitOfMeasure ?? 'bottiglia',
      price: (params.product.unitPrice ?? 8) * 24,
      unitOfMeasurePrice: 'EUR',
      type: 'OUT',
      invoiceCode: `DDT-${year}-0001`,
      companySupplierName: params.partner.name,
      deliveryNoteId: deliveryNote.id,
    },
  });
  await prisma.salesOrder.update({
    where: { id: params.orderId },
    data: { status: SalesOrderStatus.FULFILLED },
  });
  return deliveryNote.id;
}
