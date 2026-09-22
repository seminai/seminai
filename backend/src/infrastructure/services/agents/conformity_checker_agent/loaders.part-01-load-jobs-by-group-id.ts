import type { JobWithRelations, ProductWithLabel } from './types';
import { prisma } from '../../../repositories/Prisma';
import { cleanRegNumber } from '../dosage_agent/cleanRegNumber';
import { Prisma } from '@prisma/client';

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
export function normalizeJobWithRelations(job: {
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
export function generateRegNumberVariants(registrationNumbers: string[]): string[] {
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
export function buildLabelLookupConditions(params: {
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
