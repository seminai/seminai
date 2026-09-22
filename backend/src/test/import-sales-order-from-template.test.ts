import * as XLSX from 'xlsx';
import { ProductCategory } from '@prisma/client';
import { Product } from '../domain/entities/Product';
import { IProductRepository } from '../domain/repositories/IProductRepository';
import { IBusinessPartnerRepository } from '../domain/repositories/IBusinessPartnerRepository';
import { CreateSalesOrderUseCase } from '../application/use-cases/sales-order/CreateSalesOrderUseCase';
import { CreateOrUpdatePartnerFromExtractionUseCase } from '../application/use-cases/business-partner/CreateOrUpdatePartnerFromExtractionUseCase';
import { ImportSalesOrderFromTemplateUseCase } from '../application/use-cases/sales-order/ImportSalesOrderFromTemplateUseCase';
import type { ResolvedOrderLineDto } from '../domain/dtos/standard-order.dto';

const COMPANY_ID = 'company-1';

function buildBuffer(productName: string): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Nome cliente', 'Cantina Cliente'],
    ['P.IVA', 'IT01234567890'],
    [],
    ['Prodotto', 'Annata', 'Quantità', 'Prezzo unitario'],
    [productName, 2018, 6, ''],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Ordine');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function makeProduct(input: { id: string; name: string; isActive?: boolean }): Product {
  return new Product(
    input.id,
    input.name,
    'SKU-1',
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
    input.isActive ?? true,
  );
}

function productRepo(products: Product[]): IProductRepository {
  return {
    findManyByCompanyId: jest.fn().mockResolvedValue(products),
  } as unknown as IProductRepository;
}

function partnerRepo(matchedId: string | null): IBusinessPartnerRepository {
  return {
    findDuplicate: jest.fn().mockResolvedValue(matchedId ? { id: matchedId } : null),
  } as unknown as IBusinessPartnerRepository;
}

function createUseCaseStub(): { useCase: CreateSalesOrderUseCase; execute: jest.Mock } {
  const execute = jest.fn().mockResolvedValue({
    order: { order: { id: 'order-1', status: 'DRAFT' }, items: [] },
    totals: { taxableAmount: 0, vatAmount: 0, total: 0 },
  });
  return { useCase: { execute } as unknown as CreateSalesOrderUseCase, execute };
}

function upsertStub(): { useCase: CreateOrUpdatePartnerFromExtractionUseCase; execute: jest.Mock } {
  const execute = jest.fn().mockResolvedValue({ partner: { id: 'new-partner' }, reused: false });
  return { useCase: { execute } as unknown as CreateOrUpdatePartnerFromExtractionUseCase, execute };
}

describe('ImportSalesOrderFromTemplateUseCase.preview', () => {
  it('marks canCreate=true and willCreate=false when partner and product match', async () => {
    const useCase = new ImportSalesOrderFromTemplateUseCase(
      productRepo([makeProduct({ id: 'prod-1', name: 'Amarone' })]),
      partnerRepo('partner-1'),
      createUseCaseStub().useCase,
      upsertStub().useCase,
    );

    const preview = await useCase.preview({
      fileBuffer: buildBuffer('Amarone'),
      fileName: 'ordine.xlsx',
      companyId: COMPANY_ID,
    });

    expect(preview.partner.matchedId).toBe('partner-1');
    expect(preview.partner.willCreate).toBe(false);
    expect(preview.lines[0].matchedProductId).toBe('prod-1');
    expect(preview.canCreate).toBe(true);
  });

  it('stays creatable (willCreate) when the customer is unmatched but products match', async () => {
    const useCase = new ImportSalesOrderFromTemplateUseCase(
      productRepo([makeProduct({ id: 'prod-1', name: 'Amarone' })]),
      partnerRepo(null),
      createUseCaseStub().useCase,
      upsertStub().useCase,
    );

    const preview = await useCase.preview({
      fileBuffer: buildBuffer('Amarone'),
      fileName: 'ordine.xlsx',
      companyId: COMPANY_ID,
    });

    expect(preview.partner.matchedId).toBeNull();
    expect(preview.partner.willCreate).toBe(true);
    expect(preview.warnings).toContain('CUSTOMER_WILL_BE_CREATED');
    expect(preview.canCreate).toBe(true);
  });

  it('flags PRODUCT_NOT_FOUND per line and blocks creation', async () => {
    const useCase = new ImportSalesOrderFromTemplateUseCase(
      productRepo([]),
      partnerRepo('partner-1'),
      createUseCaseStub().useCase,
      upsertStub().useCase,
    );

    const preview = await useCase.preview({
      fileBuffer: buildBuffer('Sconosciuto'),
      fileName: 'ordine.xlsx',
      companyId: COMPANY_ID,
    });

    expect(preview.lines[0].matchedProductId).toBeNull();
    expect(preview.lines[0].warnings).toContain('PRODUCT_NOT_FOUND');
    expect(preview.canCreate).toBe(false);
  });
});

describe('ImportSalesOrderFromTemplateUseCase.commit', () => {
  const lines: ResolvedOrderLineDto[] = [
    {
      productName: 'Amarone',
      quantity: 6,
      unitPrice: null,
      vintage: 2018,
      matchedProductId: 'prod-1',
      unitPriceResolved: 12,
      warnings: [],
    },
  ];

  it('uses the explicit partnerId without upserting', async () => {
    const create = createUseCaseStub();
    const upsert = upsertStub();
    const useCase = new ImportSalesOrderFromTemplateUseCase(
      productRepo([]),
      partnerRepo(null),
      create.useCase,
      upsert.useCase,
    );

    await useCase.commit({
      companyId: COMPANY_ID,
      partnerId: 'partner-1',
      customerName: 'Cantina Cliente',
      customerVat: 'IT01234567890',
      lines,
      sourceChannel: 'template',
    });

    expect(upsert.execute).not.toHaveBeenCalled();
    expect(create.execute).toHaveBeenCalledWith(
      expect.objectContaining({ partnerId: 'partner-1', sourceRef: 'template' }),
    );
  });

  it('auto-creates the customer when no partnerId is provided', async () => {
    const create = createUseCaseStub();
    const upsert = upsertStub();
    const useCase = new ImportSalesOrderFromTemplateUseCase(
      productRepo([]),
      partnerRepo(null),
      create.useCase,
      upsert.useCase,
    );

    await useCase.commit({
      companyId: COMPANY_ID,
      customerName: 'Cliente Nuovo',
      customerVat: 'IT01234567890',
      lines,
      sourceChannel: 'email',
      sourceRef: 'email:ing-1',
    });

    expect(upsert.execute).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: COMPANY_ID, name: 'Cliente Nuovo' }),
    );
    expect(create.execute).toHaveBeenCalledWith(
      expect.objectContaining({ partnerId: 'new-partner', sourceRef: 'email:ing-1' }),
    );
  });
});
