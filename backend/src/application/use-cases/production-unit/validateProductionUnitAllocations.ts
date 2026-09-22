import { AppError } from '../../../domain/errors/AppError';
import { IFieldRepository } from '../../../domain/repositories/IFieldRepository';

export interface ProductionUnitAllocationInput {
  readonly fieldId: string;
  readonly areaHa: number;
}

export async function validateProductionUnitAllocations(
  allocations: readonly ProductionUnitAllocationInput[],
  fieldRepository: IFieldRepository,
  contextLabel: string,
): Promise<void> {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    throw AppError.badRequest(`Missing allocations in ${contextLabel}`, 'MISSING_ALLOCATIONS');
  }

  const seenFieldIds = new Set<string>();
  for (let index = 0; index < allocations.length; index += 1) {
    const allocation = allocations[index];
    const fieldId = allocation.fieldId?.trim() ?? '';
    if (!fieldId) {
      throw AppError.badRequest(
        `Missing fieldId in ${contextLabel} allocations[${index}]`,
        'FIELD_ID_REQUIRED',
      );
    }
    if (seenFieldIds.has(fieldId)) {
      throw AppError.badRequest(
        `Duplicate fieldId "${fieldId}" in ${contextLabel} allocations`,
        'DUPLICATE_FIELD_ALLOCATION',
      );
    }
    seenFieldIds.add(fieldId);

    const field = await fieldRepository.findById(fieldId);
    if (!field) {
      throw AppError.notFound(
        `Field not found for ${contextLabel} allocations[${index}] (fieldId: ${fieldId})`,
        'FIELD_NOT_FOUND',
      );
    }
  }
}
