import { ProductRegistrationLookupService } from '../../utils/ProductRegistrationLookup';
import { LabelCategory } from '@prisma/client';

const lookupService = new ProductRegistrationLookupService();

/**
 * Classifies a product as LabelCategory.FITO or LabelCategory.FERTILIZER (returns null in this context as requested,
 * or potentially returns the enum if logic changes).
 * Current logic: Returns LabelCategory.FITO if found, otherwise null (implied fertilizer).
 *
 * @param regNumber The registration number of the product
 * @param productName The name of the product
 * @returns LabelCategory.FITO if found in the dataset, otherwise null (implies LabelCategory.FERTILIZER)
 */
export const classifyProduct = (
  regNumber: string,
  productName: string,
): typeof LabelCategory.FITO | null => {
  const isFitofarmaco = lookupService.validateProduct(regNumber, productName);

  if (isFitofarmaco) {
    return LabelCategory.FITO;
  }

  return null;
};
