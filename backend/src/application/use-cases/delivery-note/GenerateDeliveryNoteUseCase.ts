import { SalesOrderStatus } from '@prisma/client';
import { BusinessPartner } from '../../../domain/entities/BusinessPartner';
import { ISalesOrderRepository } from '../../../domain/repositories/ISalesOrderRepository';
import { IProductRepository } from '../../../domain/repositories/IProductRepository';
import { IBusinessPartnerRepository } from '../../../domain/repositories/IBusinessPartnerRepository';
import {
  DeliveryNoteLineInput,
  DeliveryNoteWithItems,
  IDeliveryNoteRepository,
} from '../../../domain/repositories/IDeliveryNoteRepository';
import { GenerateDeliveryNoteDTO } from '../../../domain/dtos/delivery-note.dto';
import { buildCustomerSnapshot } from '../../../domain/utils/customer-snapshot';
import { AppError } from '../../../domain/errors/AppError';

/**
 * Generates a DDT from a CONFIRMED order. Validates mandatory customer data,
 * freezes a customer + product snapshot, then delegates the atomic write
 * (numbering + scarico magazzino + order FULFILLED) to the repository transaction.
 */
export class GenerateDeliveryNoteUseCase {
  constructor(
    private readonly salesOrderRepository: ISalesOrderRepository,
    private readonly deliveryNoteRepository: IDeliveryNoteRepository,
    private readonly partnerRepository: IBusinessPartnerRepository,
    private readonly productRepository: IProductRepository,
  ) {}

  async execute(data: GenerateDeliveryNoteDTO): Promise<DeliveryNoteWithItems> {
    const found = await this.salesOrderRepository.findById(data.orderId);
    if (!found) {
      throw AppError.notFound('Order not found', 'ORDER_NOT_FOUND');
    }
    const { order, items } = found;
    if (order.status !== SalesOrderStatus.CONFIRMED) {
      throw AppError.conflict('Order must be CONFIRMED to generate a DDT', 'ORDER_NOT_CONFIRMED');
    }
    if (items.length === 0) {
      throw AppError.badRequest('Order has no lines', 'EMPTY_ORDER');
    }
    const partner = await this.partnerRepository.findById(order.partnerId);
    if (!partner) {
      throw AppError.notFound('Customer not found', 'PARTNER_NOT_FOUND');
    }
    this.assertMandatoryCustomerData(partner);

    const lines: DeliveryNoteLineInput[] = [];
    for (const item of items) {
      const product = await this.productRepository.findById(item.productId);
      if (!product) {
        throw AppError.notFound(`Product ${item.productId} not found`, 'PRODUCT_NOT_FOUND');
      }
      lines.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        vintage: product.vintage,
        unitOfMeasure: product.unitOfMeasure,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        vatRate: item.vatRate,
      });
    }

    const ddtDate = data.ddtDate ?? new Date();
    return this.deliveryNoteRepository.generate({
      companyId: order.companyId,
      partnerId: partner.id,
      orderId: order.id,
      year: ddtDate.getFullYear(),
      ddtDate,
      causale: data.causale ?? 'Vendita',
      carrier: data.carrier ?? null,
      packagesCount: data.packagesCount ?? null,
      estimatedWeightKg: data.estimatedWeightKg ?? null,
      deliveryNotesText: data.deliveryNotesText ?? partner.deliveryNotesText ?? null,
      customerSnapshot: buildCustomerSnapshot(partner),
      lines,
    });
  }

  private assertMandatoryCustomerData(partner: BusinessPartner): void {
    if (!partner.name || partner.name.trim().length === 0) {
      throw AppError.badRequest(
        'Customer ragione sociale is required',
        'DDT_MISSING_CUSTOMER_NAME',
      );
    }
    if (!partner.vatNumber && !partner.fiscalCode) {
      throw AppError.badRequest(
        'Customer P.IVA or codice fiscale is required',
        'DDT_MISSING_TAX_ID',
      );
    }
    if (!partner.deliveryAddress && !partner.address) {
      throw AppError.badRequest('Customer delivery address is required', 'DDT_MISSING_ADDRESS');
    }
  }
}
