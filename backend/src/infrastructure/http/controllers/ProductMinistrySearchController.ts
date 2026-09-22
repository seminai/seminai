import { Request, Response } from 'express';
import { SearchFitosanitariProductsUseCase } from '../../../application/use-cases/product/SearchFitosanitariProductsUseCase';
import { AppError } from '../../../domain/errors/AppError';

/**
 * Controller for read-only Ministry phytosanitary product search.
 */
export class ProductMinistrySearchController {
  constructor(private readonly useCase = new SearchFitosanitariProductsUseCase()) {}

  async search(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const result = this.useCase.execute({
      q: this.getQueryText(request, 'q'),
      name: this.getQueryText(request, 'name'),
      registrationNumber: this.getQueryText(request, 'registrationNumber'),
      activeIngredient: this.getQueryText(request, 'activeIngredient'),
      limit: this.getQueryNumber(request, 'limit'),
    });
    return response.json({ status: 'success', data: result });
  }

  private getQueryText(request: Request, key: string): string | undefined {
    const value = request.query[key];
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private getQueryNumber(request: Request, key: string): number | undefined {
    const value = request.query[key];
    if (typeof value !== 'string') return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
}
