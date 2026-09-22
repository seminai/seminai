import { ImportProductsFromCsvExcelUseCase } from '../application/use-cases/product/ImportProductsFromCsvExcelUseCase';
import { IProductRepository } from '../domain/repositories/IProductRepository';
import { IStockRepository } from '../domain/repositories/IStockRepository';
import { IWarehouseRepository } from '../domain/repositories/IWarehouseRepository';

describe('ImportProductsFromCsvExcelUseCase pricing mapping', () => {
  it('maps price, movement type and invoice due date in preview mode', async () => {
    const productRepository = {} as IProductRepository;
    const stockRepository = {} as IStockRepository;
    const warehouseRepository = {} as IWarehouseRepository;
    const useCase = new ImportProductsFromCsvExcelUseCase(
      productRepository,
      stockRepository,
      warehouseRepository,
    );
    const csvContent = [
      'Nome prodotto;Quantità stock;Unità di misura stock;Prezzo;Unità di misura prezzo;Tipo movimento;Codice DDT;Data DDT;Data fattura;Scadenza fattura',
      'Prodotto Test;10;kg;12,50;EUR/kg;OUT;DDT-001;10/01/2026;11/01/2026;31/01/2026',
    ].join('\n');
    const output = await useCase.execute({
      companyId: 'company-id',
      fileName: 'import.csv',
      fileBuffer: Buffer.from(csvContent, 'utf-8'),
      preview: true,
    });
    expect(output.errors).toHaveLength(0);
    expect(output.previewProducts).toHaveLength(1);
    expect(output.previewProducts?.[0].stock.type).toBe('OUT');
    expect(output.previewProducts?.[0].stock.quantity).toBe(-10);
    expect(output.previewProducts?.[0].stock.price).toBe(12.5);
    expect(output.previewProducts?.[0].stock.unitOfMeasurePrice).toBe('EUR/kg');
    expect(output.previewProducts?.[0].stock.invoiceDate).toBeTruthy();
    expect(output.previewProducts?.[0].stock.invoiceDueDate).toBeTruthy();
  });
});
