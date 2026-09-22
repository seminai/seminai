import { SalesOrderStatus } from '@prisma/client';
import { BusinessPartner } from '../../../domain/entities/BusinessPartner';
import { ISalesOrderRepository } from '../../../domain/repositories/ISalesOrderRepository';
import { IProductRepository } from '../../../domain/repositories/IProductRepository';
import { IBusinessPartnerRepository } from '../../../domain/repositories/IBusinessPartnerRepository';
import {
  IProformaInvoiceRepository,
  ProformaInvoiceLineInput,
  ProformaInvoiceWithItems,
} from '../../../domain/repositories/IProformaInvoiceRepository';
import { GenerateProformaDTO } from '../../../domain/dtos/proforma.dto';
import { buildCustomerSnapshot } from '../../../domain/utils/customer-snapshot';
import { AppError } from '../../../domain/errors/AppError';

/**
 * Generates a proforma from a DRAFT or CONFIRMED order. Validates mandatory customer
 * data, freezes a customer + product snapshot, then delegates the atomic write
 * (numbering only) to the repository. No warehouse impact, no order-status change.
 */
export class GenerateProformaUseCase {
  constructor(
    private readonly salesOrderRepository: ISalesOrderRepository,
    private readonly proformaInvoiceRepository: IProformaInvoiceRepository,
    private readonly partnerRepository: IBusinessPartnerRepository,
    private readonly productRepository: IProductRepository,
  ) {}

  async execute(data: GenerateProformaDTO): Promise<ProformaInvoiceWithItems> {
    const found = await this.salesOrderRepository.findById(data.orderId);
    if (!found) {
      throw AppError.notFound('Order not found', 'ORDER_NOT_FOUND');
    }
    const { order, items } = found;
    if (order.status !== SalesOrderStatus.DRAFT && order.status !== SalesOrderStatus.CONFIRMED) {
      throw AppError.conflict(
        'Proforma can only be generated from a DRAFT or CONFIRMED order',
        'ORDER_NOT_PROFORMABLE',
      );
    }
    if (items.length === 0) {
      throw AppError.badRequest('Order has no lines', 'EMPTY_ORDER');
    }
    const partner = await this.partnerRepository.findById(order.partnerId);
    if (!partner) {
      throw AppError.notFound('Customer not found', 'PARTNER_NOT_FOUND');
    }
    this.assertMandatoryCustomerData(partner);

    const lines: ProformaInvoiceLineInput[] = [];
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

    const proformaDate = data.proformaDate ?? new Date();
    return this.proformaInvoiceRepository.generate({
      companyId: order.companyId,
      partnerId: partner.id,
      orderId: order.id,
      year: proformaDate.getFullYear(),
      proformaDate,
      causale: data.causale ?? 'Proforma',
      deliveryNotesText: data.deliveryNotesText ?? partner.deliveryNotesText ?? null,
      customerSnapshot: buildCustomerSnapshot(partner),
      lines,
    });
  }

  private assertMandatoryCustomerData(partner: BusinessPartner): void {
    if (!partner.name || partner.name.trim().length === 0) {
      throw AppError.badRequest(
        'Customer ragione sociale is required',
        'PROFORMA_MISSING_CUSTOMER_NAME',
      );
    }
    if (!partner.vatNumber && !partner.fiscalCode) {
      throw AppError.badRequest(
        'Customer P.IVA or codice fiscale is required',
        'PROFORMA_MISSING_TAX_ID',
      );
    }
  }
}
