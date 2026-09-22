import { LabelExtraction } from '@prisma/client';
import { prisma } from '../../../repositories/Prisma';
import { ConformityCheckerContext, toDosageAgentContext } from './context';
import type { ProductWithLabel, FieldDataForConformity } from './types';
import { PrismaLabelExtractionRepository } from '../../../repositories/PrismaLabelExtractionRepository';
import { GetLabelTextProvider } from '../../tool/getLabelText.provider';
import { ExtractLabelAdapter } from '../../tool/extractLabel.adapter';
import { BulkExtractLabelsUseCase } from '../../../../application/use-cases/label/BulkExtractLabelsUseCase';
import { cleanRegNumber } from '../dosage_agent/cleanRegNumber';
import { buildLabelLookupConditions } from './loaders.part-01-load-jobs-by-group-id';

/**
 * Loads a label extraction for a product (tries registrationNumber first, then productName).
 * NOTE: Uses cleanRegNumber to normalize registration numbers (as dosage_agent does)
 */
export async function loadLabelForJob(params: {
  readonly registrationNumber: string | null | undefined;
  readonly productName: string | null | undefined;
}): Promise<LabelExtraction | null> {
  const regNumber = (params.registrationNumber ?? '').trim();
  const productName = (params.productName ?? '').trim();
  if (!regNumber && !productName) {
    return null;
  }

  const orConditions = buildLabelLookupConditions({ regNumber, productName });
  if (orConditions.length === 0) {
    return null;
  }

  const label = await prisma.labelExtraction.findFirst({
    where: { isArchived: false, OR: orConditions },
  });

  return label ?? null;
}

/**
 * Loads company ID for a product by its ID
 */
export async function loadCompanyIdByProductId(productId: string): Promise<string | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { warehouse: { select: { companyId: true } } },
  });
  return product?.warehouse.companyId ?? null;
}

/**
 * Batch-loads company IDs for multiple products by their IDs.
 * Single query — avoids N+1.
 */
export async function loadCompanyIdsByProductIds(
  productIds: string[],
): Promise<Map<string, string>> {
  const companyIdByProductId = new Map<string, string>();
  if (productIds.length === 0) return companyIdByProductId;

  const products = await prisma.product.findMany({
    where: { id: { in: [...new Set(productIds)] } },
    select: { id: true, warehouse: { select: { companyId: true } } },
  });

  for (const product of products) {
    if (product.warehouse.companyId) {
      companyIdByProductId.set(product.id, product.warehouse.companyId);
    }
  }

  return companyIdByProductId;
}

/**
 * Extracts missing labels for products that were not found in the database.
 * Uses BulkExtractLabelsUseCase (same as dosage_agent) to fetch from SIAN and persist.
 */
export async function extractMissingLabels(
  missingProducts: ReadonlyArray<{ name: string; regNumber: string }>,
  context?: ConformityCheckerContext,
): Promise<{
  labelByRegNumber: Map<string, ProductWithLabel['label']>;
  labelByProductName: Map<string, ProductWithLabel['label']>;
}> {
  const labelByRegNumber = new Map<string, ProductWithLabel['label']>();
  const labelByProductName = new Map<string, ProductWithLabel['label']>();

  if (missingProducts.length === 0) {
    return { labelByRegNumber, labelByProductName };
  }

  console.log(
    `[CONFORMITY-CHECKER] Extracting ${missingProducts.length} missing labels from SIAN...`,
  );

  const repo = new PrismaLabelExtractionRepository(prisma);
  const textProvider = new GetLabelTextProvider();
  const extractor = new ExtractLabelAdapter();
  const useCase = new BulkExtractLabelsUseCase(repo, textProvider, extractor);

  const extraction = await useCase.execute({
    items: missingProducts,
    context: toDosageAgentContext(context),
    concurrency: 5,
  });

  for (const result of extraction.results) {
    if ((result.status === 'cached' || result.status === 'extracted') && result.label) {
      const normalizedRegNumber = cleanRegNumber(result.regNumber);
      const labelRecord = result.record as unknown as ProductWithLabel['label'];
      if (normalizedRegNumber && normalizedRegNumber !== '0') {
        labelByRegNumber.set(normalizedRegNumber, labelRecord);
      }
      labelByRegNumber.set(result.regNumber, labelRecord);
      labelByProductName.set(result.name.toLowerCase().trim(), labelRecord);

      console.log(
        `[CONFORMITY-CHECKER] ✓ Extracted label for "${result.name}" (${result.regNumber})`,
      );
    } else if (result.status === 'failed') {
      console.log(
        `[CONFORMITY-CHECKER] ✗ Failed to extract label for "${result.name}" (${result.regNumber}): ${result.error}`,
      );
    }
  }

  console.log(`[CONFORMITY-CHECKER] Extracted ${labelByRegNumber.size} labels successfully`);

  return { labelByRegNumber, labelByProductName };
}

/**
 * Batch-loads field data for production units via ProductionUnitOnField join table.
 * Returns a Map<productionUnitId, FieldDataForConformity>.
 * Single batch query - no N+1.
 */
export async function loadFieldDataForProductionUnits(
  unitIds: string[],
): Promise<Map<string, FieldDataForConformity>> {
  const fieldDataByUnit = new Map<string, FieldDataForConformity>();
  if (unitIds.length === 0) return fieldDataByUnit;

  const uniqueUnitIds = [...new Set(unitIds)];

  const units = await prisma.productionUnit.findMany({
    where: { id: { in: uniqueUnitIds } },
    select: {
      id: true,
      productionUnitsOnFields: {
        take: 1,
        select: {
          field: {
            select: {
              id: true,
              companyId: true,
              region: true,
              bufferZoneNotes: true,
              sauHa: true,
            },
          },
        },
      },
    },
  });

  for (const unit of units) {
    const fieldRelation = unit.productionUnitsOnFields[0];
    if (fieldRelation?.field) {
      const field = fieldRelation.field;
      fieldDataByUnit.set(unit.id, {
        fieldId: field.id,
        companyId: field.companyId,
        region: field.region,
        bufferZoneNotes: field.bufferZoneNotes,
        sauHa: field.sauHa,
      });
    }
  }

  return fieldDataByUnit;
}
