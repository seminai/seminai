import { GroupInvoiceSuggestedProductsWithStocksService } from '../infrastructure/services/tool/group-invoice-suggested-products-with-stocks';

describe('GroupInvoiceSuggestedProductsWithStocksService', () => {
  it('groups multiple stock rows under the same product', () => {
    const service = new GroupInvoiceSuggestedProductsWithStocksService();
    const grouped = service.execute({
      products: [
        {
          productName: 'CONC. NITR.AMM. 27% + CaO 11,6% GRANULARE',
          registrationNumber: null,
          productCategory: 'FERTILIZER',
          administrativeStatus: null,
          quantity: 1.8,
          quantityUnitOfMeasure: 'TM',
          supplierName: 'ALBAVERDE',
          supplierVat: 'IT001',
          invoiceNumber: 'FT 1/155',
          invoiceDate: '2025-02-28',
          invoiceDueDate: null,
          unitPrice: null,
          totalPrice: null,
        },
        {
          productName: 'CONC. NITR.AMM. 27% + CaO 11,6% GRANULARE',
          registrationNumber: null,
          productCategory: 'FERTILIZER',
          administrativeStatus: null,
          quantity: 0.6,
          quantityUnitOfMeasure: 'TM',
          supplierName: 'ALBAVERDE',
          supplierVat: 'IT001',
          invoiceNumber: 'FT 1/449',
          invoiceDate: '2025-03-31',
          invoiceDueDate: null,
          unitPrice: null,
          totalPrice: null,
        },
      ],
    });
    expect(grouped).toHaveLength(1);
    expect(grouped[0].product.productName).toBe('CONC. NITR.AMM. 27% + CaO 11,6% GRANULARE');
    expect(grouped[0].stocks).toHaveLength(2);
  });

  it('keeps separate groups when supplier vat differs', () => {
    const service = new GroupInvoiceSuggestedProductsWithStocksService();
    const grouped = service.execute({
      products: [
        {
          productName: 'METRIPHAR 70 WG',
          registrationNumber: null,
          productCategory: 'OTHER',
          administrativeStatus: null,
          quantity: 4,
          quantityUnitOfMeasure: 'PZ',
          supplierName: 'SUPPLIER A',
          supplierVat: 'IT-A',
          invoiceNumber: 'FT 1/446',
          invoiceDate: '2025-05-31',
          invoiceDueDate: null,
          unitPrice: null,
          totalPrice: null,
        },
        {
          productName: 'METRIPHAR 70 WG',
          registrationNumber: null,
          productCategory: 'OTHER',
          administrativeStatus: null,
          quantity: 2,
          quantityUnitOfMeasure: 'PZ',
          supplierName: 'SUPPLIER B',
          supplierVat: 'IT-B',
          invoiceNumber: 'FT 1/447',
          invoiceDate: '2025-06-01',
          invoiceDueDate: null,
          unitPrice: null,
          totalPrice: null,
        },
      ],
    });
    expect(grouped).toHaveLength(2);
  });

  it('exposes quantityExtractedInProductName fields and converts pieces to real unit', () => {
    const service = new GroupInvoiceSuggestedProductsWithStocksService();
    const grouped = service.execute({
      products: [
        {
          productName: 'BOOM EFFECT 500 g',
          registrationNumber: null,
          productCategory: 'PHYTOSANITARY',
          administrativeStatus: null,
          quantity: 2,
          quantityUnitOfMeasure: 'pz',
          supplierName: 'SUPPLIER X',
          supplierVat: 'IT-X',
          invoiceNumber: 'FT 1/500',
          invoiceDate: '2025-06-15',
          invoiceDueDate: null,
          unitPrice: null,
          totalPrice: null,
        },
      ],
    });
    expect(grouped).toHaveLength(1);
    const stock = grouped[0].stocks[0];
    expect(stock.quantityExtractedInProductName).toBe(500);
    expect(stock.quantityExtractedInProductNameUnit).toBe('GR');
    // 2 pz * 500g = 1000g -> converted to kg = 1
    expect(stock.quantity).toBe(1000);
    expect(stock.quantityUnitOfMeasure).toBe('GR');
    expect(stock.quantityConverted).toBeCloseTo(1);
    expect(stock.unitMeasureConverted).toBe('kg');
  });
});
