import { PartnerType, SalesOrderStatus } from '@prisma/client';
import { AppError } from '../domain/errors/AppError';
import { BusinessPartner } from '../domain/entities/BusinessPartner';
import { SalesOrder } from '../domain/entities/SalesOrder';
import { SalesOrderItem } from '../domain/entities/SalesOrderItem';
import { buildCustomerSnapshot } from '../domain/utils/customer-snapshot';
import { IBusinessPartnerRepository } from '../domain/repositories/IBusinessPartnerRepository';
import { ISalesOrderRepository } from '../domain/repositories/ISalesOrderRepository';
import { IStockRepository } from '../domain/repositories/IStockRepository';
import { IProductRepository, ProductWithRelations } from '../domain/repositories/IProductRepository';
import { IDeliveryNoteRepository } from '../domain/repositories/IDeliveryNoteRepository';
import { GenerateDeliveryNoteUseCase } from '../application/use-cases/delivery-note/GenerateDeliveryNoteUseCase';
import { CancelDeliveryNoteUseCase } from '../application/use-cases/delivery-note/CancelDeliveryNoteUseCase';

const COMPANY_ID = 'company-1';

function makeCustomer(
  overrides: Partial<Parameters<typeof BusinessPartner.create>[0]> = {},
): BusinessPartner {
  return BusinessPartner.create({
    companyId: COMPANY_ID,
    type: PartnerType.CUSTOMER,
    name: 'Cantina Rossi',
    vatNumber: '12345678901',
    address: 'Via Roma 1',
    city: 'Verona',
    ...overrides,
  });
}

function makeProduct(
  overrides: Partial<{
    id: string;
    isActive: boolean;
    unitPrice: number | null;
    vatRate: number | null;
  }> = {},
): ProductWithRelations {
  return {
    id: overrides.id ?? 'prod-1',
    name: 'Amarone 2018',
    sku: 'AMA-18',
    vintage: 2018,
    unitOfMeasure: 'bottiglia',
    unitPrice: overrides.unitPrice ?? 12,
    vatRate: overrides.vatRate ?? 22,
    isActive: overrides.isActive ?? true,
    warehouse: { name: 'Cantina', company: { id: COMPANY_ID, name: 'Azienda' } },
  } as unknown as ProductWithRelations;
}

function partnerRepoMock(): jest.Mocked<IBusinessPartnerRepository> {
  return {
    create: jest.fn(),
    update: jest.fn(),
    findById: jest.fn(),
    findManyByCompany: jest.fn(),
    findDuplicate: jest.fn(),
    search: jest.fn(),
    findDueForFollowUp: jest.fn(),
  };
}

function orderRepoMock(): jest.Mocked<ISalesOrderRepository> {
  return {
    create: jest.fn(),
    findById: jest.fn(),
    findManyByCompany: jest.fn(),
    updateStatus: jest.fn(),
    getReservedQuantities: jest.fn().mockResolvedValue({}),
  };
}

function stockRepoMock(): jest.Mocked<IStockRepository> {
  return {
    create: jest.fn(),
    createMany: jest.fn(),
    getAvailableQuantity: jest.fn(),
    deleteByJobId: jest.fn(),
    deleteBySourceFileIds: jest.fn(),
    deleteByCompanyId: jest.fn(),
    updateFileUrl: jest.fn(),
    update: jest.fn(),
    findDeletionContext: jest.fn(),
    delete: jest.fn(),
  };
}
void (() => stockRepoMock);

function productRepoMock(): jest.Mocked<IProductRepository> {
  return {
    create: jest.fn(),
    createMany: jest.fn(),
    findById: jest.fn(),
    findManyByWarehouseId: jest.fn(),
    findManyByUserId: jest.fn(),
    findManyByCompanyId: jest.fn(),
    findByNameAndWarehouseId: jest.fn(),
    findAllWithRegistrationNumber: jest.fn(),
    findAllWithRegistrationNumberByUserId: jest.fn(),
    findAllByUserId: jest.fn(),
    update: jest.fn(),
    updateAdministrativeStatusBulk: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
}

function ddtRepoMock(): jest.Mocked<IDeliveryNoteRepository> {
  return {
    generate: jest.fn(),
    cancel: jest.fn(),
    markSent: jest.fn(),
    findById: jest.fn(),
    findManyByCompany: jest.fn(),
    setHtmlUrl: jest.fn(),
  };
}
describe('GenerateDeliveryNoteUseCase', () => {
  function confirmedOrder() {
    return {
      order: new SalesOrder({
        id: 'order-1',
        companyId: COMPANY_ID,
        partnerId: 'partner-1',
        orderDate: new Date(),
        status: SalesOrderStatus.CONFIRMED,
        internalNotes: null,
        deliveryNotesText: null,
        sourceRef: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      items: [
        SalesOrderItem.create({
          orderId: 'order-1',
          productId: 'prod-1',
          quantity: 4,
          unitPrice: 12,
          vatRate: 22,
        }),
      ],
    };
  }

  it('rejects when the order is not CONFIRMED', async () => {
    const orderRepo = orderRepoMock();
    orderRepo.findById.mockResolvedValue({
      order: new SalesOrder({ ...confirmedOrder().order, status: SalesOrderStatus.DRAFT }),
      items: confirmedOrder().items,
    });
    await expect(
      new GenerateDeliveryNoteUseCase(
        orderRepo,
        ddtRepoMock(),
        partnerRepoMock(),
        productRepoMock(),
      ).execute({ orderId: 'order-1' }),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_CONFIRMED' });
  });

  it('rejects when the customer lacks both P.IVA and codice fiscale', async () => {
    const orderRepo = orderRepoMock();
    const partnerRepo = partnerRepoMock();
    orderRepo.findById.mockResolvedValue(confirmedOrder());
    partnerRepo.findById.mockResolvedValue(makeCustomer({ vatNumber: null, fiscalCode: null }));
    await expect(
      new GenerateDeliveryNoteUseCase(
        orderRepo,
        ddtRepoMock(),
        partnerRepo,
        productRepoMock(),
      ).execute({ orderId: 'order-1' }),
    ).rejects.toMatchObject({ code: 'DDT_MISSING_TAX_ID' });
  });

  it('generates a DDT with frozen customer + product snapshot', async () => {
    const orderRepo = orderRepoMock();
    const partnerRepo = partnerRepoMock();
    const productRepo = productRepoMock();
    const ddtRepo = ddtRepoMock();
    orderRepo.findById.mockResolvedValue(confirmedOrder());
    partnerRepo.findById.mockResolvedValue(makeCustomer());
    productRepo.findById.mockResolvedValue(makeProduct());
    ddtRepo.generate.mockResolvedValue({
      deliveryNote: { id: 'ddt-1', number: 1, year: 2026 } as never,
      items: [],
    });

    await new GenerateDeliveryNoteUseCase(orderRepo, ddtRepo, partnerRepo, productRepo).execute({
      orderId: 'order-1',
    });

    const callArg = ddtRepo.generate.mock.calls[0][0];
    expect(callArg.customerSnapshot.name).toBe('Cantina Rossi');
    expect(callArg.customerSnapshot.vatNumber).toBe('12345678901');
    expect(callArg.lines[0]).toMatchObject({
      productName: 'Amarone 2018',
      sku: 'AMA-18',
      vintage: 2018,
      quantity: 4,
    });
  });
});

describe('CancelDeliveryNoteUseCase', () => {
  it('throws when the DDT does not exist', async () => {
    const ddtRepo = ddtRepoMock();
    ddtRepo.findById.mockResolvedValue(null);
    await expect(
      new CancelDeliveryNoteUseCase(ddtRepo).execute({ deliveryNoteId: 'missing' }),
    ).rejects.toBeInstanceOf(AppError);
    expect(ddtRepo.cancel).not.toHaveBeenCalled();
  });

  it('delegates to the repository cancel transaction', async () => {
    const ddtRepo = ddtRepoMock();
    ddtRepo.findById.mockResolvedValue({ deliveryNote: { id: 'ddt-1' } as never, items: [] });
    ddtRepo.cancel.mockResolvedValue({ deliveryNote: { id: 'ddt-1' } as never, items: [] });
    await new CancelDeliveryNoteUseCase(ddtRepo).execute({
      deliveryNoteId: 'ddt-1',
      reason: 'reso',
    });
    expect(ddtRepo.cancel).toHaveBeenCalledWith({ deliveryNoteId: 'ddt-1', reason: 'reso' });
  });
});

describe('buildCustomerSnapshot', () => {
  it('falls back to legal address when delivery address is absent', () => {
    const snapshot = buildCustomerSnapshot(makeCustomer({ address: 'Via Roma 1', city: 'Verona' }));
    expect(snapshot.deliveryAddress.address).toBe('Via Roma 1');
    expect(snapshot.deliveryAddress.city).toBe('Verona');
  });
});
