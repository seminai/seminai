import { PartnerType, ProductCategory, SalesOrderStatus } from '@prisma/client';
import { SalesOrder } from '../domain/entities/SalesOrder';
import { SalesOrderItem } from '../domain/entities/SalesOrderItem';
import { BusinessPartner } from '../domain/entities/BusinessPartner';
import { Product } from '../domain/entities/Product';
import { ISalesOrderRepository } from '../domain/repositories/ISalesOrderRepository';
import { IBusinessPartnerRepository } from '../domain/repositories/IBusinessPartnerRepository';
import { IProductRepository } from '../domain/repositories/IProductRepository';
import { IProformaInvoiceRepository } from '../domain/repositories/IProformaInvoiceRepository';
import { GenerateProformaUseCase } from '../application/use-cases/proforma/GenerateProformaUseCase';

const COMPANY_ID = 'company-1';

function makeOrder(status: SalesOrderStatus): { order: SalesOrder; items: SalesOrderItem[] } {
  const order = new SalesOrder({
    id: 'order-1',
    companyId: COMPANY_ID,
    partnerId: 'partner-1',
    orderDate: new Date(),
    status,
    internalNotes: null,
    deliveryNotesText: null,
    sourceRef: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const items = [
    SalesOrderItem.create({
      orderId: 'order-1',
      productId: 'prod-1',
      quantity: 6,
      unitPrice: 12,
      vatRate: 22,
    }),
  ];
  return { order, items };
}

function makeCustomer(
  overrides: Partial<Parameters<typeof BusinessPartner.create>[0]> = {},
): BusinessPartner {
  return BusinessPartner.create({
    companyId: COMPANY_ID,
    type: PartnerType.CUSTOMER,
    name: 'Cantina Cliente',
    vatNumber: '12345678901',
    address: 'Via Roma 1',
    city: 'Verona',
    ...overrides,
  });
}

function makeProduct(): Product {
  return new Product(
    'prod-1',
    'Amarone',
    'AMA-18',
    null,
    ProductCategory.HARVEST,
    'Vino',
    null,
    null,
    null,
    null,
    null,
    'wh-1',
    new Date(),
    new Date(),
    2018,
    12,
    22,
    'bottiglia',
    true,
  );
}

function orderRepo(found: { order: SalesOrder; items: SalesOrderItem[] }): ISalesOrderRepository {
  return { findById: jest.fn().mockResolvedValue(found) } as unknown as ISalesOrderRepository;
}

function partnerRepo(partner: BusinessPartner | null): IBusinessPartnerRepository {
  return {
    findById: jest.fn().mockResolvedValue(partner),
  } as unknown as IBusinessPartnerRepository;
}

function productRepo(): IProductRepository {
  return { findById: jest.fn().mockResolvedValue(makeProduct()) } as unknown as IProductRepository;
}

function proformaRepo(): { repo: IProformaInvoiceRepository; generate: jest.Mock } {
  const generate = jest.fn().mockResolvedValue({
    proformaInvoice: { id: 'pf-1', number: 1, year: 2026 },
    items: [],
  });
  return { repo: { generate } as unknown as IProformaInvoiceRepository, generate };
}

describe('GenerateProformaUseCase', () => {
  it('generates a proforma from a DRAFT order and delegates the correct input', async () => {
    const pf = proformaRepo();
    const useCase = new GenerateProformaUseCase(
      orderRepo(makeOrder(SalesOrderStatus.DRAFT)),
      pf.repo,
      partnerRepo(makeCustomer()),
      productRepo(),
    );

    await useCase.execute({ orderId: 'order-1' });

    const callArg = pf.generate.mock.calls[0][0];
    expect(callArg.orderId).toBe('order-1');
    expect(callArg.causale).toBe('Proforma');
    expect(callArg.customerSnapshot.name).toBe('Cantina Cliente');
    expect(callArg.lines[0]).toMatchObject({ productName: 'Amarone', quantity: 6, unitPrice: 12 });
  });

  it('also allows a CONFIRMED order', async () => {
    const pf = proformaRepo();
    const useCase = new GenerateProformaUseCase(
      orderRepo(makeOrder(SalesOrderStatus.CONFIRMED)),
      pf.repo,
      partnerRepo(makeCustomer()),
      productRepo(),
    );
    await expect(useCase.execute({ orderId: 'order-1' })).resolves.toBeDefined();
    expect(pf.generate).toHaveBeenCalledTimes(1);
  });

  it('rejects a FULFILLED order', async () => {
    const pf = proformaRepo();
    const useCase = new GenerateProformaUseCase(
      orderRepo(makeOrder(SalesOrderStatus.FULFILLED)),
      pf.repo,
      partnerRepo(makeCustomer()),
      productRepo(),
    );
    await expect(useCase.execute({ orderId: 'order-1' })).rejects.toMatchObject({
      code: 'ORDER_NOT_PROFORMABLE',
    });
    expect(pf.generate).not.toHaveBeenCalled();
  });

  it('rejects a customer lacking both P.IVA and codice fiscale', async () => {
    const pf = proformaRepo();
    const useCase = new GenerateProformaUseCase(
      orderRepo(makeOrder(SalesOrderStatus.DRAFT)),
      pf.repo,
      partnerRepo(makeCustomer({ vatNumber: null, fiscalCode: null })),
      productRepo(),
    );
    await expect(useCase.execute({ orderId: 'order-1' })).rejects.toMatchObject({
      code: 'PROFORMA_MISSING_TAX_ID',
    });
  });
});
