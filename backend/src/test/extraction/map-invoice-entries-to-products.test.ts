import { CompanyKind } from '@prisma/client';
import { mapInvoiceEntriesToProducts } from '../../infrastructure/services/extraction/map-invoice-entries-to-products';
import { type DdtEntry } from '../../domain/dtos/ddt-entry.dto';

describe('mapInvoiceEntriesToProducts', () => {
  it('maps DDT entries using orderNumber and ddtDate', () => {
    const entry: DdtEntry = {
      productName: 'Steel panel',
      registrationNumber: null,
      productCategory: 'OTHER',
      quantity: 25,
      quantityUnitOfMeasure: 'PZ',
      supplierName: 'EXAMPLE MANUFACTURING S.R.L.',
      supplierVat: '03471920367',
      ddtDate: '2026-05-28',
      orderNumber: '37/2026',
      unitPrice: 18.5,
      totalPrice: 462.5,
    };
    const actualProducts = mapInvoiceEntriesToProducts({
      entries: [entry],
      fileId: 'file-1',
      extractionId: 'extraction-1',
      isDdtCategory: true,
    });
    expect(actualProducts).toHaveLength(1);
    const product = actualProducts[0];
    if (!product?.stock) throw new Error('Expected mapped product with stock');
    expect(product.stock.ddtCode).toBe('37/2026');
    expect(product.stock.ddtDate).toBe('2026-05-28');
    expect(product.stock.invoiceCode).toBeUndefined();
  });

  it('falls back to legacy invoice fields for DDT entries', () => {
    const actualProducts = mapInvoiceEntriesToProducts({
      entries: [
        {
          productName: 'Legacy DDT row',
          registrationNumber: null,
          productCategory: 'OTHER',
          quantity: 1,
          quantityUnitOfMeasure: 'PZ',
          supplierName: 'Supplier',
          supplierVat: '12345678901',
          invoiceNumber: 'DDT-LEGACY',
          invoiceDate: '2026-01-15',
          invoiceDueDate: null,
          administrativeStatus: null,
          unitPrice: 10,
          totalPrice: 10,
        },
      ],
      fileId: null,
      extractionId: 'extraction-2',
      isDdtCategory: true,
    });
    expect(actualProducts).toHaveLength(1);
    const product = actualProducts[0];
    if (!product?.stock) throw new Error('Expected mapped product with stock');
    expect(product.stock.ddtCode).toBe('DDT-LEGACY');
    expect(product.stock.ddtDate).toBe('2026-01-15');
  });

  it('maps manufacturing custom type to OTHER category and product type', () => {
    const actualProducts = mapInvoiceEntriesToProducts({
      entries: [
        {
          productName: 'Steel panel',
          registrationNumber: null,
          productCategory: 'Lamiera',
          quantity: 1,
          quantityUnitOfMeasure: 'PZ',
          supplierName: 'Supplier',
          supplierVat: '12345678901',
          invoiceNumber: '1',
          invoiceDate: '2026-01-01',
          invoiceDueDate: null,
          administrativeStatus: null,
          unitPrice: 10,
          totalPrice: 10,
        },
      ],
      fileId: null,
      extractionId: 'extraction-3',
      isDdtCategory: false,
      companyKind: CompanyKind.MANUFACTURING,
    });

    expect(actualProducts[0]?.category).toBe('OTHER');
    expect(actualProducts[0]?.type).toBe('Lamiera');
  });
});
