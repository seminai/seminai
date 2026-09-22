import { ProductionUnit } from '../../../domain/entities/ProductionUnit';
import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import { IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import { AppError } from '../../../domain/errors/AppError';

export interface CreateProductionUnitDTO {
  allocations: Array<{ fieldId: string; areaHa: number }>;
  name: string;
  cropName: string;
  cropType: string;
  variety: string;
  protocoll: string;
  areaHa?: number; // if omitted, derived from allocations
  protectionStructure: string;
  startDate: Date;
  floweringDate: Date;
  harvestingDate: Date;
  endDate: Date;
  occupazione?: string | null;
  destinazioneDiUso?: string | null;
  acquaTotalePeridoL: number;
}

export class CreateProductionUnitUseCase {
  constructor(
    private readonly productionUnitRepository: IProductionUnitRepository,
    private readonly fieldRepository: IFieldRepository,
  ) {}

  /**
   * Validates that for the given date range, the sum of overlapping production units areaHa
   * plus the new one does not exceed the field.sauHa (available usable area).
   */
  async execute(data: CreateProductionUnitDTO): Promise<{ productionUnit: ProductionUnit }> {
    if (!Array.isArray(data.allocations) || data.allocations.length === 0) {
      throw AppError.badRequest('Allocations are required', 'MISSING_ALLOCATIONS');
    }
    const totalAllocation = data.allocations.reduce(
      (sum: number, alloc: { fieldId: string; areaHa: number }) => sum + alloc.areaHa,
      0,
    );
    const totalArea = typeof data.areaHa === 'number' ? data.areaHa : totalAllocation;
    if (Math.abs(totalArea - totalAllocation) > 1e-6) {
      throw AppError.badRequest('areaHa must equal sum of allocations', 'AREA_MISMATCH');
    }

    const companyIds = new Set<string>();
    for (const { fieldId, areaHa } of data.allocations) {
      const field = await this.fieldRepository.findById(fieldId);
      if (!field) throw AppError.notFound('Field not found', 'FIELD_NOT_FOUND');
      if (field.sauHa === null || typeof field.sauHa === 'undefined') {
        throw AppError.badRequest('Field sauHa is not set', 'FIELD_SAUHA_NOT_SET');
      }
      if (!field.companyId) {
        throw AppError.badRequest('Field has no associated company', 'FIELD_NO_COMPANY');
      }
      companyIds.add(field.companyId);
      const overlappingArea = await this.productionUnitRepository.sumAreaByFieldAndOverlappingRange(
        fieldId,
        { startDate: data.startDate, endDate: data.endDate },
      );
      const totalWithNew = overlappingArea + areaHa;
      if (totalWithNew > field.sauHa) {
        const window = await this.productionUnitRepository.getOverlappingDateWindow(fieldId, {
          startDate: data.startDate,
          endDate: data.endDate,
        });
        const suggestion =
          window.earliestStart && window.latestEnd
            ? `Try before ${window.earliestStart.toISOString()} or after ${window.latestEnd.toISOString()}`
            : 'Try a different date range';
        throw AppError.badRequest(
          `Insufficient area on field ${fieldId}. Used: ${overlappingArea} ha, requested: ${areaHa} ha, available: ${field.sauHa} ha. ${suggestion}`,
          'INSUFFICIENT_FIELD_AREA',
        );
      }
    }

    if (companyIds.size > 1) {
      throw AppError.badRequest(
        'Allocations must belong to fields of the same company',
        'ALLOCATIONS_MUST_BE_SAME_COMPANY',
      );
    }

    const entity = ProductionUnit.create({
      name: data.name,
      cropName: data.cropName,
      cropType: data.cropType,
      variety: data.variety,
      protocoll: data.protocoll,
      areaHa: totalArea,
      protectionStructure: data.protectionStructure,
      startDate: data.startDate,
      floweringDate: data.floweringDate,
      harvestingDate: data.harvestingDate,
      endDate: data.endDate,
      occupazione: data.occupazione ?? null,
      destinazioneDiUso: data.destinazioneDiUso ?? null,
      acquaTotalePeridoL: data.acquaTotalePeridoL,
    });

    const productionUnit = await this.productionUnitRepository.create(
      entity,
      data.allocations.map((a: { fieldId: string; areaHa: number }) => ({
        fieldId: a.fieldId,
        areaHaOnField: a.areaHa,
      })),
    );
    return { productionUnit };
  }
}
