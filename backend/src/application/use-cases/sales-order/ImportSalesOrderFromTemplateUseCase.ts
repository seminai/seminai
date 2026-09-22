import { PartnerType } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { normalizeKey } from '../../../utils/excel-normalize';
import { normalizeVat } from '../../../domain/utils/vat';
import { type IProductRepository } from '../../../domain/repositories/IProductRepository';
import { type IBusinessPartnerRepository } from '../../../domain/repositories/IBusinessPartnerRepository';
import { type Product } from '../../../domain/entities/Product';
import {
  type OrderSourceChannel,
  type OrderTemplatePreviewDto,
  type ResolvedOrderLineDto,
  type ResolvedPartnerDto,
  type StandardOrderDto,
  type StandardOrderLineDto,
} from '../../../domain/dtos/standard-order.dto';
import { parseOrderTemplate } from './parse-order-template';
import { CreateSalesOrderUseCase, type CreateSalesOrderResult } from './CreateSalesOrderUseCase';
import { CreateOrUpdatePartnerFromExtractionUseCase } from '../business-partner/CreateOrUpdatePartnerFromExtractionUseCase';

export interface PreviewOrderTemplateParams {
  readonly fileBuffer: Buffer;
  readonly fileName: string;
  readonly companyId: string;
  readonly sourceChannel?: OrderSourceChannel;
}

export interface CommitOrderTemplateParams {
  readonly companyId: string;
  /** Explicit partner override; when absent the customer is matched-or-created. */
  readonly partnerId?: string;
  readonly customerName: string;
  readonly customerVat?: string | null;
  readonly lines: readonly ResolvedOrderLineDto[];
  readonly deliveryNotesText?: string | null;
  readonly sourceChannel: OrderSourceChannel;
  readonly sourceRef?: string | null;
}

/**
 * Parses an order template, resolves customer + products against the company
 * catalog (preview), and creates the DRAFT order on commit. The customer is
 * matched-or-created (Phase 3): unmatched customers are auto-created on commit.
 */
export class ImportSalesOrderFromTemplateUseCase {
  constructor(
    private readonly productRepository: IProductRepository,
    private readonly partnerRepository: IBusinessPartnerRepository,
    private readonly createSalesOrderUseCase: CreateSalesOrderUseCase,
    private readonly createOrUpdatePartnerUseCase: CreateOrUpdatePartnerFromExtractionUseCase,
  ) {}

  async preview(params: PreviewOrderTemplateParams): Promise<OrderTemplatePreviewDto> {
    const standardOrder = parseOrderTemplate({
      fileBuffer: params.fileBuffer,
      fileName: params.fileName,
      sourceChannel: params.sourceChannel,
    });
    const partner = await this.resolvePartner(params.companyId, standardOrder);
    const productIndex = await this.buildProductIndex(params.companyId);
    const lines = standardOrder.lines.map((line) => resolveLine(line, productIndex));
    const warnings = partner.matchedId ? [] : ['CUSTOMER_WILL_BE_CREATED'];
    const canCreate = computeCanCreate(partner, lines);
    return { standardOrder, partner, lines, warnings, canCreate };
  }

  async commit(params: CommitOrderTemplateParams): Promise<CreateSalesOrderResult> {
    const items = params.lines.map((line) => {
      if (!line.matchedProductId) {
        throw AppError.badRequest('Order line has no resolved product', 'ORDER_NOT_RESOLVABLE');
      }
      return {
        productId: line.matchedProductId,
        quantity: line.quantity,
        unitPrice: line.unitPrice ?? undefined,
      };
    });
    const partnerId = params.partnerId ?? (await this.upsertPartner(params)).id;
    return this.createSalesOrderUseCase.execute({
      companyId: params.companyId,
      partnerId,
      items,
      deliveryNotesText: params.deliveryNotesText ?? null,
      sourceRef: params.sourceRef ?? params.sourceChannel,
    });
  }

  private async upsertPartner(params: CommitOrderTemplateParams): Promise<{ id: string }> {
    const result = await this.createOrUpdatePartnerUseCase.execute({
      companyId: params.companyId,
      name: params.customerName,
      vatNumber: params.customerVat ?? null,
    });
    return { id: result.partner.id };
  }

  private async resolvePartner(
    companyId: string,
    order: StandardOrderDto,
  ): Promise<ResolvedPartnerDto> {
    const vatNumber = normalizeVat(order.customerVat);
    const match = await this.partnerRepository.findDuplicate({
      companyId,
      type: PartnerType.CUSTOMER,
      vatNumber,
      name: order.customerName,
    });
    return {
      matchedId: match?.id ?? null,
      willCreate: !match,
      name: order.customerName,
      vatNumber,
    };
  }

  private async buildProductIndex(companyId: string): Promise<ReadonlyMap<string, Product>> {
    const products = await this.productRepository.findManyByCompanyId(companyId);
    const byKey = new Map<string, Product>();
    products.forEach((product) => byKey.set(normalizeKey(product.name), product));
    products.forEach((product) => {
      const skuKey = product.sku ? normalizeKey(product.sku) : '';
      if (skuKey && !byKey.has(skuKey)) byKey.set(skuKey, product);
    });
    return byKey;
  }
}

function resolveLine(
  line: StandardOrderLineDto,
  productIndex: ReadonlyMap<string, Product>,
): ResolvedOrderLineDto {
  const product = productIndex.get(normalizeKey(line.productName));
  if (!product) {
    return {
      ...line,
      matchedProductId: null,
      unitPriceResolved: null,
      warnings: ['PRODUCT_NOT_FOUND'],
    };
  }
  const warnings = product.isActive ? [] : ['PRODUCT_INACTIVE'];
  return {
    ...line,
    matchedProductId: product.id,
    unitPriceResolved: line.unitPrice ?? product.unitPrice ?? null,
    warnings,
  };
}

function computeCanCreate(
  partner: ResolvedPartnerDto,
  lines: readonly ResolvedOrderLineDto[],
): boolean {
  const everyLineCreatable =
    lines.length > 0 &&
    lines.every((line) => line.matchedProductId && !line.warnings.includes('PRODUCT_INACTIVE'));
  return (Boolean(partner.matchedId) || partner.willCreate) && everyLineCreatable;
}
