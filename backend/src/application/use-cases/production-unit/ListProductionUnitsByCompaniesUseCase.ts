import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import { IUserOnCompanyRepository } from '../../../domain/repositories/IUserOnCompanyRepository';
import { ProductionUnit } from '../../../domain/entities/ProductionUnit';
import { AppError } from '../../../domain/errors/AppError';

/**
 * Use case for listing production units by multiple company IDs.
 * Verifies that the user has access to all specified companies.
 */
export class ListProductionUnitsByCompaniesUseCase {
  constructor(
    private readonly repository: IProductionUnitRepository,
    private readonly userOnCompanyRepository: IUserOnCompanyRepository,
  ) {}

  async execute(
    userId: string,
    companyIds: string[],
  ): Promise<{
    productionUnits: Array<{
      productionUnit: ProductionUnit;
      companyId: string;
      companyName: string;
      crop: {
        name: string;
        type: string;
        variety: string;
      };
      fields: Array<{
        id: string;
        name: string;
        sauHa: number | null;
        gisHa: number | null;
        areaHaOnField: number;
      }>;
    }>;
  }> {
    if (!Array.isArray(companyIds) || companyIds.length === 0) {
      throw AppError.badRequest('companyIds must be a non-empty array', 'INVALID_COMPANY_IDS');
    }
    const userCompanies = await this.userOnCompanyRepository.findByUserId(userId);
    const userCompanyIds = new Set(userCompanies.map((uc) => uc.companyId));
    const invalidCompanyIds = companyIds.filter((id) => !userCompanyIds.has(id));
    if (invalidCompanyIds.length > 0) {
      throw AppError.forbidden(
        `User does not have access to companies: ${invalidCompanyIds.join(', ')}`,
        'COMPANY_ACCESS_DENIED',
      );
    }
    const results = await this.repository.findManyByUserIdAndCompanyIds(userId, companyIds);
    const groupedResults = new Map<
      string,
      {
        productionUnit: ProductionUnit;
        companyId: string;
        companyName: string;
        fields: Array<{
          id: string;
          name: string;
          sauHa: number | null;
          gisHa: number | null;
          areaHaOnField: number;
        }>;
      }
    >();
    for (const result of results) {
      const puId = result.productionUnit.id;
      const existing = groupedResults.get(puId);
      const fieldInfo = {
        id: result.field.id,
        name: result.field.name,
        sauHa: result.field.sauHa,
        gisHa: result.field.gisHa,
        areaHaOnField: result.areaHaOnField,
      };
      if (existing) {
        existing.fields.push(fieldInfo);
      } else {
        groupedResults.set(puId, {
          productionUnit: result.productionUnit,
          companyId: result.companyId,
          companyName: result.companyName,
          fields: [fieldInfo],
        });
      }
    }
    const productionUnits = Array.from(groupedResults.values()).map((grouped) => ({
      productionUnit: grouped.productionUnit,
      companyId: grouped.companyId,
      companyName: grouped.companyName,
      crop: {
        name: grouped.productionUnit.cropName,
        type: grouped.productionUnit.cropType,
        variety: grouped.productionUnit.variety,
      },
      fields: grouped.fields,
    }));
    return { productionUnits };
  }
}
