import { ProductCategory } from '@prisma/client';
import { CreateProductUseCase } from '../application/use-cases/product/CreateProductUseCase';
import { IProductRepository } from '../domain/repositories/IProductRepository';
import { IStockRepository } from '../domain/repositories/IStockRepository';
import { Product } from '../domain/entities/Product';
import { FitosanitariLookupService } from '../infrastructure/services/utils/FitosanitariLookupService';

describe('CreateProductUseCase administrativeStatus rules', () => {
  it('should keep administrativeStatus null for non-pesticide products', async () => {
    const productRepository = {
      create: jest.fn().mockImplementation(async (product: Product) => product),
    } as unknown as IProductRepository;
    const stockRepository = {
      create: jest.fn(),
    } as unknown as IStockRepository;
    const useCase = new CreateProductUseCase(productRepository, stockRepository);
    const fitosanitariService = FitosanitariLookupService.getInstance();
    const lookupSpy = jest.spyOn(fitosanitariService, 'lookupStatus').mockReturnValue('Revocato');

    const result = await useCase.execute({
      warehouseId: 'w1',
      name: 'Concime NPK',
      category: ProductCategory.FERTILIZER,
      registrationNumber: null,
    });

    expect(lookupSpy).not.toHaveBeenCalled();
    expect(result.product.category).toBe(ProductCategory.FERTILIZER);
    expect(result.product.administrativeStatus).toBeNull();
    lookupSpy.mockRestore();
  });
});
