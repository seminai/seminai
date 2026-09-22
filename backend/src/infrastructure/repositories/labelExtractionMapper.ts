import {
  LabelExtraction as LabelExtractionRow,
  LabelRefreshStatus as PrismaRefreshStatus,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import {
  LabelCategory,
  LabelExtractionRecord,
  LabelRefreshStatus,
  SavedLabelExtraction,
} from '../../domain/repositories/ILabelExtractionRepository';
import {
  normalizeLabelProductName,
  normalizeLabelRegistrationNumber,
} from '../../domain/utils/labelNormalization';

type NormalizedLabelInput = {
  readonly normalizedProduct: string;
  readonly normalizedRegistration: string | null;
};

function buildNormalizedInput(
  input: Pick<SavedLabelExtraction, 'productName' | 'registrationNumber'>,
): NormalizedLabelInput {
  return {
    normalizedProduct: normalizeLabelProductName(input.productName),
    normalizedRegistration: normalizeLabelRegistrationNumber(input.registrationNumber),
  };
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function buildCreateData(
  input: SavedLabelExtraction,
  normalized: NormalizedLabelInput,
): Prisma.LabelExtractionUncheckedCreateInput {
  return {
    productName: input.productName,
    registrationNumber: input.registrationNumber,
    normalizedProductName: normalized.normalizedProduct,
    normalizedRegistrationNumber: normalized.normalizedRegistration,
    sourceUrl: input.sourceUrl,
    sourcePdfHash: input.sourcePdfHash ?? null,
    rawTextHash: input.rawTextHash ?? hashText(input.rawText),
    officialSourceUrl: input.officialSourceUrl ?? null,
    category: input.category,
    label: input.label as unknown as Prisma.InputJsonValue,
    rawText: input.rawText,
    extractionConfidence: input.extractionConfidence,
    extractedFields: input.extractedFields,
    errors: input.errors,
    qualityExtraction: input.qualityExtraction,
    lastRefreshedAt: input.lastRefreshedAt,
    lastRefreshStatus: input.lastRefreshStatus as PrismaRefreshStatus | null | undefined,
    lastRefreshError: input.lastRefreshError,
  };
}

function buildSaveUpdateData(
  input: SavedLabelExtraction,
  normalized: NormalizedLabelInput,
): Prisma.LabelExtractionUpdateInput {
  return {
    normalizedProductName: normalized.normalizedProduct,
    normalizedRegistrationNumber: normalized.normalizedRegistration,
    sourceUrl: input.sourceUrl,
    sourcePdfHash: input.sourcePdfHash ?? null,
    rawTextHash: input.rawTextHash ?? hashText(input.rawText),
    officialSourceUrl: input.officialSourceUrl ?? null,
    category: input.category,
    label: input.label as unknown as Prisma.InputJsonValue,
    rawText: input.rawText,
    extractionConfidence: input.extractionConfidence,
    extractedFields: input.extractedFields,
    errors: input.errors,
    qualityExtraction: input.qualityExtraction,
    lastRefreshedAt: input.lastRefreshedAt,
    lastRefreshStatus: input.lastRefreshStatus as PrismaRefreshStatus | null | undefined,
    lastRefreshError: input.lastRefreshError,
  };
}

function buildPartialUpdateData(
  input: Partial<SavedLabelExtraction>,
): Prisma.LabelExtractionUpdateInput {
  const data: Prisma.LabelExtractionUpdateInput = {};
  if (input.productName !== undefined) {
    data.productName = input.productName;
    data.normalizedProductName = normalizeLabelProductName(input.productName);
  }
  if (input.registrationNumber !== undefined) {
    data.registrationNumber = input.registrationNumber;
    data.normalizedRegistrationNumber = normalizeLabelRegistrationNumber(input.registrationNumber);
  }
  if (input.sourceUrl !== undefined) data.sourceUrl = input.sourceUrl;
  if (input.sourcePdfHash !== undefined) data.sourcePdfHash = input.sourcePdfHash;
  if (input.rawTextHash !== undefined) data.rawTextHash = input.rawTextHash;
  if (input.officialSourceUrl !== undefined) data.officialSourceUrl = input.officialSourceUrl;
  if (input.category !== undefined) data.category = input.category;
  if (input.label !== undefined) data.label = input.label as unknown as Prisma.InputJsonValue;
  if (input.rawText !== undefined) {
    data.rawText = input.rawText;
    if (input.rawTextHash === undefined) data.rawTextHash = hashText(input.rawText);
  }
  if (input.extractionConfidence !== undefined)
    data.extractionConfidence = input.extractionConfidence;
  if (input.extractedFields !== undefined) data.extractedFields = input.extractedFields;
  if (input.errors !== undefined) data.errors = input.errors;
  if (input.qualityExtraction !== undefined) data.qualityExtraction = input.qualityExtraction;
  if (input.lastRefreshedAt !== undefined) data.lastRefreshedAt = input.lastRefreshedAt;
  if (input.lastRefreshStatus !== undefined)
    data.lastRefreshStatus = input.lastRefreshStatus as PrismaRefreshStatus | null;
  if (input.lastRefreshError !== undefined) data.lastRefreshError = input.lastRefreshError;
  return data;
}

function mapToDomain(row: LabelExtractionRow): LabelExtractionRecord {
  return {
    id: row.id,
    productName: row.productName,
    registrationNumber: row.registrationNumber,
    normalizedProductName: row.normalizedProductName,
    normalizedRegistrationNumber: row.normalizedRegistrationNumber,
    sourceUrl: row.sourceUrl,
    sourcePdfHash: row.sourcePdfHash,
    rawTextHash: row.rawTextHash,
    officialSourceUrl: row.officialSourceUrl,
    category: row.category as LabelCategory,
    label: row.label as unknown as LabelExtractionRecord['label'],
    rawText: row.rawText,
    extractionConfidence: row.extractionConfidence,
    isVerified: row.isVerified,
    extractedFields: row.extractedFields ?? [],
    errors: row.errors ?? [],
    qualityExtraction: row.qualityExtraction ?? [],
    lastRefreshedAt: row.lastRefreshedAt,
    lastRefreshStatus: row.lastRefreshStatus as LabelRefreshStatus | null,
    lastRefreshError: row.lastRefreshError,
    isArchived: row.isArchived,
    archivedAt: row.archivedAt,
    archivedReason: row.archivedReason,
    canonicalLabelExtractionId: row.canonicalLabelExtractionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isEmptyLabel(label: Prisma.JsonValue): boolean {
  if (!label || typeof label !== 'object' || Array.isArray(label)) return true;
  const payload = label as Record<string, unknown>;
  const dosaggi = payload['dosaggi_dettagliati'];
  const colture = payload['colture_target'];
  return (
    (!Array.isArray(dosaggi) || dosaggi.length === 0) &&
    (!Array.isArray(colture) || colture.length === 0)
  );
}

export const labelExtractionMapper = {
  buildCreateData,
  buildNormalizedInput,
  buildPartialUpdateData,
  buildSaveUpdateData,
  hashText,
  isEmptyLabel,
  mapToDomain,
};
