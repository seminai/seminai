import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import { ProductionUnit } from '../../../domain/entities/ProductionUnit';

/**
 * Use case for listing all production units accessible to a user based on their company assignments.
 */
export class ListProductionUnitsByUserUseCase {
  constructor(private readonly repository: IProductionUnitRepository) {}

  async execute(userId: string): Promise<{
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
    const results = await this.repository.findManyByUserId(userId);

    // Raggruppa i risultati per production unit
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
        // Aggiungi il field all'array esistente
        existing.fields.push(fieldInfo);
      } else {
        // Crea una nuova entry
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
