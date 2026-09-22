import { prisma } from '../../../repositories/Prisma';
import { Prisma, LabelExtraction } from '@prisma/client';
import type { JobWithRelations, ProductWithLabel, FieldDataForConformity } from './types';
import { cleanRegNumber } from '../dosage_agent/cleanRegNumber';
import { PrismaLabelExtractionRepository } from '../../../repositories/PrismaLabelExtractionRepository';
import { GetLabelTextProvider } from '../../tool/getLabelText.provider';
import { ExtractLabelAdapter } from '../../tool/extractLabel.adapter';
import { BulkExtractLabelsUseCase } from '../../../../application/use-cases/label/BulkExtractLabelsUseCase';
import { ConformityCheckerContext, toDosageAgentContext } from './context';

/**
 * Loads all jobs for a group with required relations.
 * Falls back to productionUnit.cycles[0] if productionCycle is not directly linked.
 */
export async function loadJobsByGroupId(jobGroupId: string): Promise<JobWithRelations[]> {
  const jobs = await prisma.job.findMany({
    where: { jobId: jobGroupId },
    include: {
      stocks: {
        include: {
          product: true,
        },
      },
      productionUnit: {
        select: {
          id: true,
          name: true,
          areaHa: true,
          startDate: true,
          endDate: true,
          cycles: {
            orderBy: [{ seasonYear: 'desc' }, { cycleIndex: 'desc' }],
            take: 1,
            select: {
              cropName: true,
              cropType: true,
              variety: true,
            },
          },
        },
      },
      productionCycle: {
        select: {
          cropName: true,
          cropType: true,
          variety: true,
        },
      },
    },
    orderBy: { dateOfOpeation: 'asc' },
  });

  return jobs.map(normalizeJobWithRelations);
}

/**
 * Normalizes a raw Prisma job (with cycles on productionUnit) into JobWithRelations format.
 * Handles productionCycle fallback from productionUnit.cycles[0].
 */
function normalizeJobWithRelations(job: {
  productionUnit: {
    id: string;
    name: string | null;
    areaHa: number;
    startDate: Date;
    endDate: Date;
    cycles?: Array<{ cropName: string | null; cropType: string | null; variety: string | null }>;
  };
  productionCycle: {
    cropName: string | null;
    cropType: string | null;
    variety: string | null;
  } | null;
  [key: string]: unknown;
}): JobWithRelations {
  const unitCycles = job.productionUnit.cycles;
  const fallbackCycle = unitCycles && unitCycles.length > 0 ? unitCycles[0] : null;
  const productionCycle = job.productionCycle ?? fallbackCycle;

  const productionUnitWithoutCycles = {
    id: job.productionUnit.id,
    name: job.productionUnit.name,
    areaHa: job.productionUnit.areaHa,
    startDate: job.productionUnit.startDate,
    endDate: job.productionUnit.endDate,
  };

  return {
    ...job,
    productionUnit: productionUnitWithoutCycles,
    productionCycle,
  } as JobWithRelations;
}

/**
 * Generates registration number variants for database lookup.
 * Includes original, cleaned (without leading zeros), and padded versions.
 */
function generateRegNumberVariants(registrationNumbers: string[]): string[] {
  const variants: string[] = [];
  for (const rn of registrationNumbers.filter(Boolean)) {
    variants.push(rn);
    const cleaned = cleanRegNumber(rn);
    if (cleaned && cleaned !== rn) {
      variants.push(cleaned);
    }
    if (/^\d+$/.test(cleaned)) {
      variants.push('0' + cleaned);
      variants.push('00' + cleaned);
    }
  }
  return [...new Set(variants)];
}

/**
 * Loads labels for products by registration number and product name
 * NOTE: Uses cleanRegNumber to normalize registration numbers (removes leading zeros)
 */
export async function loadLabelsForProducts(
  registrationNumbers: string[],
  productNames: string[],
): Promise<{
  labelByRegNumber: Map<string, ProductWithLabel['label']>;
  labelByProductName: Map<string, ProductWithLabel['label']>;
}> {
  const uniqueRegNumbers = generateRegNumberVariants(registrationNumbers);

  const labelsByRegNumber = await prisma.labelExtraction.findMany({
    where: {
      isArchived: false,
      OR: [
        { registrationNumber: { in: uniqueRegNumbers } },
        { normalizedRegistrationNumber: { in: uniqueRegNumbers } },
      ],
    },
  });

  const labelByRegNumber = new Map<string, ProductWithLabel['label']>();
  for (const label of labelsByRegNumber) {
    const normalizedKey = cleanRegNumber(label.registrationNumber);
    if (normalizedKey && normalizedKey !== '0') {
      labelByRegNumber.set(normalizedKey, label);
    }
    labelByRegNumber.set(label.registrationNumber, label);
  }

  const normalizedProductNames = productNames
    .filter(Boolean)
    .map((name) => name.toLowerCase().trim());
  const labelsByProductName = await prisma.labelExtraction.findMany({
    where: {
      isArchived: false,
      productName: { in: normalizedProductNames, mode: 'insensitive' },
    },
  });

  const labelByProductName = new Map<string, ProductWithLabel['label']>();
  for (const label of labelsByProductName) {
    labelByProductName.set(label.productName.toLowerCase().trim(), label);
  }

  return { labelByRegNumber, labelByProductName };
}

/**
 * Builds OR conditions for label lookup query
 */
function buildLabelLookupConditions(params: {
  readonly regNumber: string;
  readonly productName: string;
}): Prisma.LabelExtractionWhereInput[] {
  const orConditions: Prisma.LabelExtractionWhereInput[] = [];

  if (params.regNumber) {
    const normalizedRegNumber = cleanRegNumber(params.regNumber);
    orConditions.push({ registrationNumber: params.regNumber });
    if (
      normalizedRegNumber &&
      normalizedRegNumber !== params.regNumber &&
      normalizedRegNumber !== '0'
    ) {
      orConditions.push({ registrationNumber: normalizedRegNumber });
      orConditions.push({ normalizedRegistrationNumber: normalizedRegNumber });
    }
    if (/^\d+$/.test(normalizedRegNumber)) {
      orConditions.push({ registrationNumber: '0' + normalizedRegNumber });
      orConditions.push({ registrationNumber: '00' + normalizedRegNumber });
    }
  }

  if (params.productName) {
    orConditions.push({
      productName: {
        equals: params.productName,
        mode: Prisma.QueryMode.insensitive,
      },
    });
  }

  return orConditions;
}

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

/**
 * Loads jobs for confirmation with required relations.
 * Uses shared normalizeJobWithRelations for consistent productionCycle fallback.
 */
export async function loadJobsForConfirmation(
  jobGroupId: string,
): Promise<Map<string, JobWithRelations>> {
  const groupJobs = await prisma.job.findMany({
    where: { jobId: jobGroupId },
    include: {
      stocks: {
        include: {
          product: {
            include: {
              warehouse: { select: { companyId: true } },
            },
          },
        },
      },
      productionUnit: {
        select: {
          areaHa: true,
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          cycles: {
            orderBy: [{ seasonYear: 'desc' }, { cycleIndex: 'desc' }],
            take: 1,
            select: {
              cropName: true,
              cropType: true,
              variety: true,
            },
          },
        },
      },
      productionCycle: { select: { cropName: true, cropType: true, variety: true } },
    },
    orderBy: { dateOfOpeation: 'asc' },
  });

  const jobById = new Map<string, JobWithRelations>();
  for (const job of groupJobs) {
    jobById.set(job.id, normalizeJobWithRelations(job));
  }

  return jobById;
}
