import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import { IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import { AppError } from '../../../domain/errors/AppError';
import { ProductionUnit } from '../../../domain/entities/ProductionUnit';

export interface UpdateProductionUnitDTO {
  id: string;
  data: Partial<ProductionUnit> & {
    startDate?: Date;
    endDate?: Date;
    areaHa?: number;
    allocations?: Array<{ fieldId: string; areaHa: number }>;
  };
}

export class UpdateProductionUnitUseCase {
  constructor(
    private readonly productionUnitRepository: IProductionUnitRepository,
    private readonly fieldRepository: IFieldRepository,
  ) {}

  async execute({
    id,
    data,
  }: UpdateProductionUnitDTO): Promise<{ productionUnit: ProductionUnit }> {
    const existing = await this.productionUnitRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('ProductionUnit not found', 'PRODUCTION_UNIT_NOT_FOUND');
    }

    const nextStart = data.startDate ?? existing.startDate;
    const nextEnd = data.endDate ?? existing.endDate;
    const nextArea = typeof data.areaHa !== 'undefined' ? data.areaHa : existing.areaHa;

    // find the (single) field linked to this PU; relation is simple per requirement
    // Validate per-field allocations if provided, else validate against existing allocations
    const allocations =
      data.allocations?.map((a) => ({ fieldId: a.fieldId, areaHaOnField: a.areaHa })) ||
      (await this.productionUnitRepository.getAllocationsByProductionUnit(id)).map((a) => ({
        fieldId: a.fieldId,
        areaHaOnField: a.areaHaOnField,
      }));

    const totalAllocation = allocations.reduce((sum, a) => sum + a.areaHaOnField, 0);
    const totalArea = typeof data.areaHa === 'number' ? data.areaHa : nextArea;
    if (Math.abs(totalArea - totalAllocation) > 1e-6) {
      throw AppError.badRequest('areaHa must equal sum of allocations', 'AREA_MISMATCH');
    }

    const companyIds = new Set<string>();
    for (const alloc of allocations) {
      const field = await this.fieldRepository.findById(alloc.fieldId);
      if (!field) throw AppError.notFound('Field not found', 'FIELD_NOT_FOUND');
      if (field.sauHa === null || typeof field.sauHa === 'undefined') {
        throw AppError.badRequest('Field sauHa is not set', 'FIELD_SAUHA_NOT_SET');
      }
      if (!field.companyId) {
        throw AppError.badRequest('Field has no associated company', 'FIELD_NO_COMPANY');
      }
      companyIds.add(field.companyId);
      // sum overlapping excluding the current PU's previous allocation on this field
      if (!nextStart || !nextEnd) {
        throw AppError.badRequest('startDate and endDate are required', 'MISSING_DATES');
      }
      const overlappingArea = await this.productionUnitRepository.sumAreaByFieldAndOverlappingRange(
        alloc.fieldId,
        { startDate: nextStart, endDate: nextEnd },
      );
      const previousAllocations =
        await this.productionUnitRepository.getAllocationsByProductionUnit(id);
      const previousOnField =
        previousAllocations.find((pa) => pa.fieldId === alloc.fieldId)?.areaHaOnField || 0;
      const currentOverlappingArea = overlappingArea - previousOnField;
      const totalWithUpdated = currentOverlappingArea + alloc.areaHaOnField;
      if (totalWithUpdated > field.sauHa) {
        throw AppError.badRequest(
          `Insufficient area on field ${alloc.fieldId}. Used: ${currentOverlappingArea} ha, requested: ${alloc.areaHaOnField} ha, available: ${field.sauHa} ha`,
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

    if (data.allocations) {
      await this.productionUnitRepository.replaceAllocations(id, allocations);
    }
    const updated = await this.productionUnitRepository.update(id, {
      ...data,
      areaHa: totalArea,
    });
    return { productionUnit: updated };
  }
}
