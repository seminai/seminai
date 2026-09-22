import { SalesOrder } from '../../../domain/entities/SalesOrder';
import { SalesOrderItem } from '../../../domain/entities/SalesOrderItem';
import {
  ISalesOrderRepository,
  SalesOrderWithItems,
} from '../../../domain/repositories/ISalesOrderRepository';
import { IProductRepository } from '../../../domain/repositories/IProductRepository';
import { IBusinessPartnerRepository } from '../../../domain/repositories/IBusinessPartnerRepository';
import { CreateSalesOrderDTO } from '../../../domain/dtos/sales-order.dto';
import { computeSalesTotals, SalesTotals } from '../../../domain/utils/sales-totals';
import { AppError } from '../../../domain/errors/AppError';

/** A persisted order together with its computed totals. */
export interface CreateSalesOrderResult {
  readonly order: SalesOrderWithItems;
  readonly totals: SalesTotals;
}

/**
 * Creates a sales order in DRAFT status. Lines inherit unit price and VAT rate
 * from the product catalog when not explicitly provided. Totals are computed,
 * never stored. Availability is validated later, at confirmation.
 */
export class CreateSalesOrderUseCase {
  constructor(
    private readonly salesOrderRepository: ISalesOrderRepository,
    private readonly productRepository: IProductRepository,
    private readonly partnerRepository: IBusinessPartnerRepository,
  ) {}

  async execute(data: CreateSalesOrderDTO): Promise<CreateSalesOrderResult> {
    if (!data.items || data.items.length === 0) {
      throw AppError.badRequest('Order must have at least one line', 'EMPTY_ORDER');
    }
    const partner = await this.partnerRepository.findById(data.partnerId);
    if (!partner || partner.companyId !== data.companyId) {
      throw AppError.notFound('Customer not found for this company', 'PARTNER_NOT_FOUND');
    }
    const order = SalesOrder.create({
      companyId: data.companyId,
      partnerId: data.partnerId,
      orderDate: data.orderDate ?? null,
      internalNotes: data.internalNotes ?? null,
      deliveryNotesText: data.deliveryNotesText ?? null,
      sourceRef: data.sourceRef ?? null,
    });
    const items: SalesOrderItem[] = [];
    for (const line of data.items) {
      const product = await this.productRepository.findById(line.productId);
      if (!product) {
        throw AppError.notFound(`Product ${line.productId} not found`, 'PRODUCT_NOT_FOUND');
      }
      if (product.warehouse.company.id !== data.companyId) {
        throw AppError.badRequest(
          `Product "${product.name}" belongs to another company`,
          'PRODUCT_WRONG_COMPANY',
        );
      }
      if (!product.isActive) {
        throw AppError.badRequest(`Product "${product.name}" is not active`, 'PRODUCT_INACTIVE');
      }
      if (line.quantity <= 0) {
        throw AppError.badRequest(`Invalid quantity for "${product.name}"`, 'INVALID_QUANTITY');
      }
      items.push(
        SalesOrderItem.create({
          orderId: order.id,
          productId: product.id,
          quantity: line.quantity,
          unitPrice: line.unitPrice ?? product.unitPrice ?? 0,
          discount: line.discount ?? 0,
          vatRate: line.vatRate ?? product.vatRate ?? 0,
        }),
      );
    }
    const saved = await this.salesOrderRepository.create(order, items);
    return { order: saved, totals: computeSalesTotals(saved.items) };
  }
}
