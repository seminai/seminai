import { PrismaClient, FieldNoteCategory, FieldNoteProcessingStatus } from '@prisma/client';
import { PrismaFieldNoteRepository } from '../../repositories/PrismaFieldNoteRepository';
import { ListFieldNotesByUserUseCase } from '../../../application/use-cases/field-note/ListFieldNotesByUserUseCase';

const DEFAULT_LIST_LIMIT = 10;
const MAX_LIST_LIMIT = 50;
const RAW_CONTENT_PREVIEW_LENGTH = 200;

export interface ListUserFieldNotesParams {
  userId: string;
  prisma: PrismaClient;
  category?: FieldNoteCategory;
  status?: FieldNoteProcessingStatus;
  fieldId?: string;
  productionUnitId?: string;
  productId?: string;
  startDate?: Date;
  endDate?: Date;
  hasLocation?: boolean;
  limit?: number;
}

export interface FieldNoteListItem {
  id: string;
  operationDate: string;
  category: FieldNoteCategory;
  status: FieldNoteProcessingStatus;
  rawContentPreview: string;
  companyName: string | null;
  fieldName: string | null;
  productionUnitName: string | null;
  productName: string | null;
  quantity: number | null;
  unitOfMeasure: string | null;
  hasAttachments: boolean;
  hasLocation: boolean;
}

export interface ListUserFieldNotesResult {
  totalMatched: number;
  returned: number;
  truncated: boolean;
  items: FieldNoteListItem[];
}

/**
 * Lists field notes for a user, with optional structured filters.
 * Results are ordered by operationDate desc and capped at `limit` (default 10, max 50).
 */
export async function listUserFieldNotes(
  params: ListUserFieldNotesParams,
): Promise<ListUserFieldNotesResult> {
  const { userId, prisma, limit, ...filters } = params;
  const effectiveLimit = Math.min(limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);

  try {
    const repository = new PrismaFieldNoteRepository(prisma);
    const useCase = new ListFieldNotesByUserUseCase(repository);
    const results = await useCase.executeWithRelations(userId, filters);

    const items = results.slice(0, effectiveLimit).map(mapToListItem);

    return {
      totalMatched: results.length,
      returned: items.length,
      truncated: results.length > items.length,
      items,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to list user field notes: ${errorMessage}`);
  }
}

interface FieldNoteRelationShape {
  id: string;
  operationDate: Date;
  category: FieldNoteCategory;
  status: FieldNoteProcessingStatus;
  rawContent: string;
  latitude: number | null;
  longitude: number | null;
  extractedData: unknown;
  field: { id: string; name: string; company: { id: string; name: string } | null } | null;
  productionUnit: { id: string; name: string } | null;
  product: { id: string; name: string } | null;
  attachments?: Array<{ id: string }>;
}

function mapToListItem(fn: FieldNoteRelationShape): FieldNoteListItem {
  const { quantity, unitOfMeasure } = extractQuantity(fn.extractedData);
  const rawContent = fn.rawContent ?? '';
  const preview =
    rawContent.length > RAW_CONTENT_PREVIEW_LENGTH
      ? `${rawContent.slice(0, RAW_CONTENT_PREVIEW_LENGTH)}…`
      : rawContent;

  return {
    id: fn.id,
    operationDate: fn.operationDate.toISOString(),
    category: fn.category,
    status: fn.status,
    rawContentPreview: preview,
    companyName: fn.field?.company?.name ?? null,
    fieldName: fn.field?.name ?? null,
    productionUnitName: fn.productionUnit?.name ?? null,
    productName: fn.product?.name ?? null,
    quantity,
    unitOfMeasure,
    hasAttachments: (fn.attachments?.length ?? 0) > 0,
    hasLocation: fn.latitude !== null && fn.longitude !== null,
  };
}

function extractQuantity(extractedData: unknown): {
  quantity: number | null;
  unitOfMeasure: string | null;
} {
  if (!extractedData || typeof extractedData !== 'object') {
    return { quantity: null, unitOfMeasure: null };
  }
  const record = extractedData as Record<string, unknown>;
  const quantity = typeof record.quantity === 'number' ? record.quantity : null;
  const unitOfMeasure = typeof record.unitOfMeasure === 'string' ? record.unitOfMeasure : null;
  return { quantity, unitOfMeasure };
}
